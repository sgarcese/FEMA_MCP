# ADR 0002: Add a stdio transport alongside Streamable HTTP

- Status: Accepted
- Date: 2026-09-22
- Amends: [ADR 0001](0001-initial-mcp-architecture.md) (transport only)

## Context

ADR 0001 chose a stateless remote Streamable HTTP server. Local MCP clients such
as Claude Desktop launch servers as child processes and speak JSON-RPC over
stdin/stdout. With HTTP as the only transport, a local user had to keep a
separate HTTP process running and point the client at it. When that process
wasn't running, the client failed to connect (`ECONNREFUSED`).

## Decision

Ship two entry points that wrap the same `createMcpServer()`:

- `src/index.ts`: stateless Streamable HTTP (`npm start`), still the shape for
  remote and hosted use.
- `src/stdio.ts`: `StdioServerTransport` (`npm run start:stdio`) for locally
  launched clients.

Tools, schemas, and upstream adapters stay identical across transports; the
stdio test asserts the same tool list as the HTTP server test.

## Consequences

- Stdout is reserved for JSON-RPC in the stdio process. Diagnostics go to
  stderr, and code reachable from `createMcpServer()` must never write to stdout.
- HTTP-only protections (browser `Origin` allowlist, health endpoint) don't
  apply to stdio. The launching client owns the process and its trust boundary.
- A stdio process runs on the user's machine and calls FEMA directly from their
  network, so coordinate lookups leave from that machine rather than a server.
- Deployment decisions are unaffected; hosting remains deferred.
