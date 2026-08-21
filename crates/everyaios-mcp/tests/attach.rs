//! P6.6 — MCP server attach loopback tests (spawn the mock server binary and
//! reconcile its tools with native precedence).

use everyaios_mcp::attach::AttachedServer;
use everyaios_mcp::ToolCatalog;

fn mock_server() -> &'static str {
    env!("CARGO_BIN_EXE_mock-mcp-server")
}

#[test]
fn attach_spawns_user_server_and_reconciles_tools() {
    let mut catalog = ToolCatalog::new();
    let mut server = AttachedServer::spawn(mock_server(), &[]).unwrap();
    let names = server
        .attach(&mut catalog, "mcp:mock")
        .expect("attach should succeed");
    assert!(names.contains(&"gmail_list".to_string()));
    assert!(names.contains(&"gmail_send".to_string()));
    assert_eq!(catalog.external_count(), 2);
    assert_eq!(catalog.origin("gmail_list"), Some("mcp:mock"));
    assert_eq!(catalog.origin("snapshot"), Some("native"));
    server.shutdown();
}

#[test]
fn native_collision_is_not_registered() {
    let mut catalog = ToolCatalog::new();
    let mut server = AttachedServer::spawn(mock_server(), &[]).unwrap();
    let names = server.attach(&mut catalog, "mcp:mock").unwrap();
    assert!(!names.contains(&"snapshot".to_string()));
    assert_eq!(catalog.origin("snapshot"), Some("native"));
    server.shutdown();
}

#[test]
fn dead_server_fails_cleanly() {
    let mut catalog = ToolCatalog::new();
    let mut server = AttachedServer::spawn("true", &[]).unwrap();
    assert!(server.attach(&mut catalog, "mcp:dead").is_err());
}
