const MCP_TRANSPORT = {
  STDIO: "stdio",
  STREAMABLE_HTTP: "streamable_http",
};

function isRemoteHttpTransport(server) {
  return (
    server?.transport === MCP_TRANSPORT.STREAMABLE_HTTP &&
    /^https?:\/\//.test(server?.url || "")
  );
}

function assertMobileSafeMcpServer(server) {
  if (!server) {
    return { ok: false, reason: "missing_server" };
  }

  if (server.transport === MCP_TRANSPORT.STDIO) {
    return { ok: false, reason: "stdio_not_supported_on_mobile" };
  }

  if (!isRemoteHttpTransport(server)) {
    return { ok: false, reason: "remote_http_required" };
  }

  return { ok: true, reason: null };
}

function getMobileSafeToolCatalog(tools, allowedNames = []) {
  const allowed = new Set(allowedNames);

  return (Array.isArray(tools) ? tools : [])
    .filter((tool) => allowed.has(tool?.name))
    .map((tool) => ({
      description: tool.description || "",
      inputSchema: tool.inputSchema || {},
      name: tool.name,
    }));
}

function buildMcpToolInvocation({ arguments: args = {}, serverId, toolName }) {
  return {
    arguments: args,
    serverId,
    toolName,
    transport: MCP_TRANSPORT.STREAMABLE_HTTP,
  };
}

module.exports = {
  MCP_TRANSPORT,
  assertMobileSafeMcpServer,
  buildMcpToolInvocation,
  getMobileSafeToolCatalog,
  isRemoteHttpTransport,
};
