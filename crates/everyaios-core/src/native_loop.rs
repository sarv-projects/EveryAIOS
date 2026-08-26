//! P29 Tier 1a + 1b — collapse IPC (native sidecar migration, spec §9.1 R6):
//!
//! **Tier 1a** — [`NativeLoop`]: an in-process actor loop over
//! `std::sync::mpsc` channels. Commands are dispatched in-process — the
//! stdio JSON-RPC framing disappears for the built-in engine path (the
//! coordinator's `frame.ts`/`message.ts`/`index.ts` collapse into this).
//!
//! **Tier 1b** — [`DirectGuard`]: guard tickets are minted and consumed
//! directly inside this process via `everyaios-guard::TicketStore` — zero
//! IPC hop, and the enforcement surface never lives in a JS/V8 memory
//! surface that could be monkey-patched.

use serde::{Deserialize, Serialize};

/// One command dispatched through the native loop (the in-process envelope
/// that replaces the stdio JSON-RPC frame).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum NativeCommand {
    /// Ask the loop to run a read-only operation.
    Read { tool: String, args: String },
    /// A mutation — must carry a guard ticket + the args hash the ticket
    /// was minted against (Tier 1b).
    Execute { tool: String, args: String, ticket_id: String, args_hash: String },
    /// Report the loop's health (for the orphan/RSS monitor).
    Health,
}

/// The loop's response envelope.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum NativeResponse {
    Ok { value: String },
    /// The mutation was refused: no valid ticket (Tier 1b enforcement).
    Refused { reason: String },
    /// Health payload: combined RSS MB (P8 measure) + children count.
    Health { rss_mb: u64, children: usize },
}

/// Tier 1b — direct guard enforcement: mint + consume tickets through the
/// `everyaios-guard` store in-process, with no transport between them.
#[derive(Debug, Default)]
pub struct DirectGuard {
    store: everyaios_guard::TicketStore,
}

impl DirectGuard {
    pub fn new() -> Self {
        Self::default()
    }

    /// Mint a ticket (the guard-2 card is rendered from this).
    pub fn mint(&mut self, ticket: everyaios_guard::AuthorizationTicket) -> String {
        self.store.mint(ticket)
    }

    /// Consume a ticket with its args hash — the exact Tier-1b guarantee:
    /// enforcement happens here, in-process, before any executor sees it.
    pub fn consume(&mut self, ticket_id: &str, args_hash: &str) -> Result<(), String> {
        self.store.use_ticket(ticket_id, args_hash).map_err(|e| e.to_string())
    }

    pub fn store(&self) -> &everyaios_guard::TicketStore {
        &self.store
    }
}

/// Tier 1a — the in-process actor loop. `dispatch` runs on the caller's
/// thread via a worker thread; the point is the *contract*: commands and
/// responses flow through typed in-process channels, not framed bytes.
#[derive(Debug)]
pub struct NativeLoop {
    tx: std::sync::mpsc::Sender<NativeCommand>,
    rx: std::sync::mpsc::Receiver<NativeResponse>,
}

impl NativeLoop {
    /// Spawn the loop with a handler closure. The handler returns the
    /// response for each command (deterministic, test-injectable).
    pub fn spawn<F>(handler: F) -> Self
    where
        F: Fn(NativeCommand) -> NativeResponse + Send + 'static,
    {
        let (cmd_tx, cmd_rx) = std::sync::mpsc::channel::<NativeCommand>();
        let (resp_tx, resp_rx) = std::sync::mpsc::channel::<NativeResponse>();
        std::thread::spawn(move || {
            for cmd in cmd_rx {
                let _ = resp_tx.send(handler(cmd));
            }
        });
        Self { tx: cmd_tx, rx: resp_rx }
    }

    /// Dispatch one command and await its response — the in-process call
    /// that replaces the stdio round-trip (no framing, no codec).
    pub fn dispatch(&self, cmd: NativeCommand) -> Option<NativeResponse> {
        self.tx.send(cmd).ok()?;
        self.rx.recv().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ticket(id: &str) -> everyaios_guard::AuthorizationTicket {
        everyaios_guard::AuthorizationTicket {
            ticket_id: id.into(),
            agent_id: "native".into(),
            session_id: "s1".into(),
            tool_id: "fs.write".into(),
            operation: "write".into(),
            args_hash: "hash-1".into(),
            paths: vec![],
            expires_at_ms: 0,
            single_use: true,
            approval_source: everyaios_guard::ApprovalSource::Policy,
            approval_nonce: String::new(),
            risk: everyaios_guard::RiskLevel::Low,
            audit_seq: 0,
            state: everyaios_guard::TicketState::Approved,
            bindings: vec![],
            execution_id: String::new(),
            action_id: String::new(),
            idempotency_key: String::new(),
        }
    }

    #[test]
    fn direct_guard_consumes_in_process() {
        let mut guard = DirectGuard::new();
        let id = guard.mint(ticket("t-1"));
        // In-process enforcement — no transport involved.
        assert!(guard.consume(&id, "hash-1").is_ok());
        // Single-use: second consume is refused.
        assert!(guard.consume(&id, "hash-1").is_err());
    }

    #[test]
    fn direct_guard_refuses_wrong_args() {
        let mut guard = DirectGuard::new();
        let id = guard.mint(ticket("t-2"));
        assert!(guard.consume(&id, "wrong-hash").is_err());
    }

    #[test]
    fn native_loop_dispatches_without_framing() {
        let loop_ = NativeLoop::spawn(|cmd| match cmd {
            NativeCommand::Read { tool, .. } => NativeResponse::Ok { value: format!("read:{tool}") },
            NativeCommand::Execute { ticket_id, .. } => {
                if ticket_id.is_empty() {
                    NativeResponse::Refused { reason: "no ticket".into() }
                } else {
                    NativeResponse::Ok { value: "executed".into() }
                }
            }
            NativeCommand::Health => NativeResponse::Health { rss_mb: 42, children: 0 },
        });
        let read = loop_.dispatch(NativeCommand::Read { tool: "snapshot".into(), args: String::new() }).unwrap();
        assert_eq!(read, NativeResponse::Ok { value: "read:snapshot".into() });
        let refused = loop_.dispatch(NativeCommand::Execute { tool: "fs.write".into(), args: String::new(), ticket_id: String::new(), args_hash: String::new() }).unwrap();
        assert!(matches!(refused, NativeResponse::Refused { .. }));
        let health = loop_.dispatch(NativeCommand::Health).unwrap();
        assert!(matches!(health, NativeResponse::Health { rss_mb: 42, .. }));
    }

    #[test]
    fn execute_requires_guard_ticket_end_to_end() {
        // The Tier-1b invariant: a mutation only flows when its ticket was
        // minted AND consumed in-process (the loop owns the guard via
        // RefCell — the real loop owns it directly).
        use std::cell::RefCell;
        let mut guard = DirectGuard::new();
        let id = guard.mint(ticket("t-3"));
        let guard = RefCell::new(guard);
        let loop_ = NativeLoop::spawn(move |cmd| match cmd {
            NativeCommand::Execute { ticket_id, args_hash, .. } => {
                match guard.borrow_mut().consume(&ticket_id, &args_hash) {
                    Ok(()) => NativeResponse::Ok { value: "executed".into() },
                    Err(_) => NativeResponse::Refused { reason: "ticket not consumable".into() },
                }
            }
            _ => NativeResponse::Refused { reason: "unexpected".into() },
        });
        let ok = loop_.dispatch(NativeCommand::Execute { tool: "fs.write".into(), args: "{}".into(), ticket_id: id, args_hash: "hash-1".into() }).unwrap();
        assert_eq!(ok, NativeResponse::Ok { value: "executed".into() });
    }
}
