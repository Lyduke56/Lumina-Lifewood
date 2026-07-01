from fastmcp import FastMCP

mcp = FastMCP("Lumina Backend")


@mcp.tool
def ping() -> str:
    """Health check tool to confirm the MCP server is running."""
    return "pong"


if __name__ == "__main__":
    mcp.run()
