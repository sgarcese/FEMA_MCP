import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createHttpApp } from "../src/http-app.js";

async function listen(app: ReturnType<typeof createHttpApp>) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind to TCP");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

void test("serves a separate health endpoint", async (t) => {
  const listener = await listen(createHttpApp());
  t.after(listener.close);

  const response = await fetch(`${listener.url}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "fema-data-mcp",
    version: "0.1.0",
  });
});

void test("rejects unapproved browser origins before MCP handling", async (t) => {
  const listener = await listen(
    createHttpApp({ allowedOrigins: ["https://prepared.example"] }),
  );
  t.after(listener.close);

  const rejected = await fetch(`${listener.url}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    }),
  });
  assert.equal(rejected.status, 403);

  const preflight = await fetch(`${listener.url}/mcp`, {
    method: "OPTIONS",
    headers: { origin: "https://prepared.example" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "https://prepared.example",
  );
});
