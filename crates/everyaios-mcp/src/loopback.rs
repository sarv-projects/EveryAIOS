//! P39.3 — loopback MCP client with keep-alive + connection pooling.
//!
//! The host side of the loopback HTTP transport: repeated tool calls from one
//! agent reuse a single pooled TCP connection instead of paying a fresh TCP
//! handshake per request (`serve_http_once` was one-request-per-connection).
//! MRTR (multi-round-trip continuation) stays the long-running path — this
//! pool is purely the short-call hot path.
//!
//! The pool is deliberately tiny (one connection): the loopback server is
//! single-threaded per connection, so a pool of N would serialize anyway.
//! Stats are exposed for the debug counter so tests (and the perf harness)
//! can assert the handshake cost is actually gone.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/// Connection reuse statistics — the P39.3 acceptance counter.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PoolStats {
    /// Fresh TCP connections established.
    pub opened: u64,
    /// Requests served over a reused (already-open) connection.
    pub reused: u64,
    /// Requests that failed and had to retry on a fresh connection.
    pub retried: u64,
}

/// A single-slot loopback connection pool with transparent reconnect.
pub struct LoopbackPool {
    addr: SocketAddr,
    bearer: Option<String>,
    stream: Option<TcpStream>,
    /// 0 = pool is closed (explicit drop / fatal error).
    pub stats: PoolStats,
}

impl LoopbackPool {
    pub fn connect(addr: SocketAddr, bearer: Option<String>) -> Self {
        Self {
            addr,
            bearer,
            stream: None,
            stats: PoolStats::default(),
        }
    }

    /// Send one JSON-RPC request and return the JSON-RPC response body.
    /// Reuses the pooled connection when healthy; reconnects once on failure.
    pub fn request(&mut self, body: &str) -> std::io::Result<String> {
        match self.request_once(body) {
            Ok(resp) => {
                self.stats.reused += 1;
                Ok(resp)
            }
            Err(first_err) => {
                // The pooled connection may have died (server restart, idle
                // timeout). Drop it and try exactly once on a fresh socket.
                self.stream = None;
                self.stats.retried += 1;
                self.request_once(body).map_err(|_| first_err)
            }
        }
    }

    /// Close the pooled connection (e.g. when tearing down a session).
    pub fn close(&mut self) {
        self.stream = None;
    }

    fn request_once(&mut self, body: &str) -> std::io::Result<String> {
        if self.stream.is_none() {
            self.stream = Some(self.open()?);
        }
        let stream = self.stream.as_mut().expect("stream just ensured");
        stream.set_read_timeout(Some(Duration::from_secs(10)))?;
        stream.set_write_timeout(Some(Duration::from_secs(10)))?;

        let mut head = format!(
            "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: keep-alive\r\nOrigin: http://127.0.0.1\r\n",
            self.addr.port(),
            body.len()
        );
        if let Some(token) = &self.bearer {
            head.push_str(&format!("Authorization: Bearer {token}\r\n"));
        }
        head.push_str("\r\n");
        stream.write_all(head.as_bytes())?;
        stream.write_all(body.as_bytes())?;
        stream.flush()?;

        read_http_response(stream)
    }

    fn open(&mut self) -> std::io::Result<TcpStream> {
        let stream = TcpStream::connect(self.addr)?;
        self.stats.opened += 1;
        Ok(stream)
    }
}

/// Read one HTTP response (status + content-length body) from the stream.
fn read_http_response(stream: &mut TcpStream) -> std::io::Result<String> {
    let mut raw = Vec::new();
    let mut chunk = [0u8; 4096];
    let header_end;
    loop {
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "loopback server closed before a complete response",
            ));
        }
        raw.extend_from_slice(&chunk[..n]);
        if let Some(pos) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            header_end = pos + 4;
            break;
        }
        if raw.len() > 64 * 1024 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "response headers too large",
            ));
        }
    }
    let header = String::from_utf8_lossy(&raw[..header_end]);
    let status = header
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    let mut content_length = 0usize;
    for line in header.lines().skip(1) {
        if let Some((key, value)) = line.split_once(':') {
            if key.trim().eq_ignore_ascii_case("content-length") {
                content_length = value.trim().parse().unwrap_or(0);
            }
        }
    }
    while raw.len() - header_end < content_length {
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        raw.extend_from_slice(&chunk[..n]);
    }
    if status != 200 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("loopback server returned HTTP {status}"),
        ));
    }
    Ok(String::from_utf8_lossy(
        &raw[header_end..header_end + content_length.min(raw.len() - header_end)],
    )
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::{McpServer, ToolCallHandler};
    use serde_json::Value;
    use std::net::TcpListener;
    use std::thread;

    struct Fake;
    impl ToolCallHandler for Fake {
        fn call(&mut self, name: &str, arguments: &Value) -> Result<Value, String> {
            Ok(serde_json::json!({"tool": name, "args": arguments}))
        }
    }

    /// Accept exactly `connections` connections, serving each until the peer
    /// closes it, then exit — so tests can `join` without an eternal loop.
    fn spawn_server(
        bearer: Option<String>,
        connections: usize,
    ) -> (SocketAddr, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            for _ in 0..connections {
                let Ok((mut stream, _)) = listener.accept() else { continue };
                let mut server = McpServer::new(Fake);
                if let Some(token) = bearer.as_deref() {
                    server = server.with_bearer_token(token);
                }
                let _ = server.serve_http_connection(&mut stream);
            }
        });
        (addr, handle)
    }

    fn list_request(id: u64) -> String {
        serde_json::json!({"jsonrpc": "2.0", "id": id, "method": "tools/list", "params": {}})
            .to_string()
    }

    #[test]
    fn sequential_calls_reuse_one_pooled_connection() {
        let (addr, handle) = spawn_server(None, 1);
        let mut pool = LoopbackPool::connect(addr, None);
        for id in 1..=5u64 {
            let resp = pool.request(&list_request(id)).unwrap();
            assert!(resp.contains("\"id\":"));
            assert!(resp.contains("tools"));
        }
        // 5 calls, exactly 1 TCP handshake, 4 reuses, 0 retries.
        assert_eq!(pool.stats.opened, 1);
        assert_eq!(pool.stats.reused, 5);
        assert_eq!(pool.stats.retried, 0);
        pool.close();
        handle.join().unwrap();
    }

    #[test]
    fn keep_alive_serves_all_requests_on_one_connection() {
        // Server-side counter: one connection must serve all N requests.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut server = McpServer::new(Fake);
            server.serve_http_connection(&mut stream).unwrap()
        });
        let mut pool = LoopbackPool::connect(addr, None);
        for id in 1..=4u64 {
            assert!(pool.request(&list_request(id)).unwrap().contains("tools"));
        }
        pool.close();
        let served = handle.join().unwrap();
        assert_eq!(served, 4);
    }

    #[test]
    fn bearer_token_still_enforced_on_pooled_connection() {
        // Good client: 1 connection (all requests reuse it).
        let (addr, _handle) = spawn_server(Some("secret".to_string()), 1);
        let mut pool = LoopbackPool::connect(addr, Some("secret".to_string()));
        assert!(pool.request(&list_request(1)).unwrap().contains("tools"));
        pool.close();

        // Bad client: initial attempt + one retry = 2 connections.
        let (addr, handle) = spawn_server(Some("secret".to_string()), 2);
        let mut bad = LoopbackPool::connect(addr, None);
        assert!(bad.request(&list_request(1)).is_err());
        bad.close();
        handle.join().unwrap();
    }

    #[test]
    fn reconnect_after_server_restart() {
        // A pool whose connection dies must transparently reconnect (once).
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let first = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut server = McpServer::new(Fake);
            let _ = server.serve_http_connection(&mut stream);
        });
        let mut pool = LoopbackPool::connect(addr, None);
        assert!(pool.request(&list_request(1)).unwrap().contains("tools"));
        first.join().unwrap(); // server gone → pooled socket is dead

        // Second server on the same addr.
        let listener2 = TcpListener::bind(addr).unwrap();
        let second = thread::spawn(move || {
            let (mut stream, _) = listener2.accept().unwrap();
            let mut server = McpServer::new(Fake);
            let _ = server.serve_http_connection(&mut stream);
        });
        assert!(pool.request(&list_request(2)).unwrap().contains("tools"));
        assert_eq!(pool.stats.opened, 2); // one reconnect
        assert_eq!(pool.stats.retried, 1);
        pool.close();
        second.join().unwrap();
    }
}
