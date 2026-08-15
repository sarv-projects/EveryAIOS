//! WebMCP support (E16 — doc 63 §4.2, chrome-devtools-mcp `webmcp.ts`
//! pattern): web-native MCP so browser sessions can **serve** and **consume**
//! MCP tools over HTTP. A page exposes tools (name + description + JSON
//! schema); the harness lists them (`list_webmcp_tools`) and executes them
//! (`execute_webmcp_tool`).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// A WebMCP tool exposed by a page/browser session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WebMcpTool {
    pub name: String,
    pub description: String,
    /// JSON Schema describing the tool's input.
    #[serde(default)]
    pub input_schema: Value,
}

/// The result of executing a WebMCP tool (matches `webmcp.ts` `{status,
/// output, errorText}`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WebMcpResult {
    /// `"ok"` or `"error"`.
    pub status: String,
    pub output: Value,
    pub error_text: Option<String>,
}

impl WebMcpResult {
    pub fn ok(output: Value) -> Self {
        Self {
            status: "ok".into(),
            output,
            error_text: None,
        }
    }

    pub fn err(message: impl Into<String>) -> Self {
        Self {
            status: "error".into(),
            output: Value::Null,
            error_text: Some(message.into()),
        }
    }
}

#[derive(Debug, Error)]
pub enum WebMcpError {
    #[error("WebMCP tool {0:?} not found")]
    UnknownTool(String),
    #[error("invalid WebMCP input JSON: {0}")]
    InvalidInputJson(String),
}

/// Executes a WebMCP tool. The page supplies this (JS-side); the harness calls
/// through it so the tool's actual behavior stays behind the registry.
pub trait WebMcpExecutor {
    fn execute(&self, tool: &WebMcpTool, input: Value) -> WebMcpResult;
}

/// The registry of WebMCP tools a session exposes.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WebMcpRegistry {
    tools: Vec<WebMcpTool>,
}

impl WebMcpRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, tool: WebMcpTool) {
        self.tools.push(tool);
    }

    pub fn tools(&self) -> &[WebMcpTool] {
        &self.tools
    }

    pub fn find(&self, name: &str) -> Option<&WebMcpTool> {
        self.tools.iter().find(|t| t.name == name)
    }

    /// `list_webmcp_tools` — the read-only handshake step.
    pub fn list(&self) -> Vec<&WebMcpTool> {
        self.tools.iter().collect()
    }

    /// `execute_webmcp_tool` — parse the JSON input, find the tool, execute.
    /// `input` is the JSON-stringified parameters (per `webmcp.ts`).
    pub fn execute<E: WebMcpExecutor + ?Sized>(
        &self,
        tool_name: &str,
        input: &str,
        executor: &E,
    ) -> Result<WebMcpResult, WebMcpError> {
        let tool = self
            .find(tool_name)
            .ok_or_else(|| WebMcpError::UnknownTool(tool_name.to_string()))?;
        let parsed: Value = if input.trim().is_empty() {
            Value::Object(Default::default())
        } else {
            serde_json::from_str(input)
                .map_err(|e| WebMcpError::InvalidInputJson(e.to_string()))?
        };
        if !parsed.is_object() {
            return Err(WebMcpError::InvalidInputJson(
                "parsed input is not an object".into(),
            ));
        }
        Ok(executor.execute(tool, parsed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct EchoExecutor;
    impl WebMcpExecutor for EchoExecutor {
        fn execute(&self, tool: &WebMcpTool, input: Value) -> WebMcpResult {
            WebMcpResult::ok(json!({"tool": tool.name, "input": input}))
        }
    }

    fn registry() -> WebMcpRegistry {
        let mut r = WebMcpRegistry::new();
        r.register(WebMcpTool {
            name: "search".into(),
            description: "search the page".into(),
            input_schema: json!({"type": "object", "properties": {"q": {"type": "string"}}}),
        });
        r
    }

    #[test]
    fn list_returns_registered_tools() {
        let r = registry();
        assert_eq!(r.list().len(), 1);
        assert_eq!(r.list()[0].name, "search");
    }

    #[test]
    fn execute_parses_input_and_runs_executor() {
        let r = registry();
        let res = r.execute("search", r#"{"q": "hello"}"#, &EchoExecutor).unwrap();
        assert_eq!(res.status, "ok");
        assert_eq!(res.output["tool"], "search");
        assert_eq!(res.output["input"]["q"], "hello");
    }

    #[test]
    fn execute_empty_input_is_empty_object() {
        let r = registry();
        let res = r.execute("search", "", &EchoExecutor).unwrap();
        assert_eq!(res.output["input"], json!({}));
    }

    #[test]
    fn unknown_tool_errors() {
        let r = registry();
        assert!(matches!(
            r.execute("ghost", "{}", &EchoExecutor),
            Err(WebMcpError::UnknownTool(_))
        ));
    }

    #[test]
    fn invalid_json_errors() {
        let r = registry();
        assert!(matches!(
            r.execute("search", "not json", &EchoExecutor),
            Err(WebMcpError::InvalidInputJson(_))
        ));
    }

    #[test]
    fn non_object_input_errors() {
        let r = registry();
        assert!(matches!(
            r.execute("search", "[1,2,3]", &EchoExecutor),
            Err(WebMcpError::InvalidInputJson(_))
        ));
    }
}
