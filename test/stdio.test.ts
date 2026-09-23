import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

void test("serves the FEMA tools over stdio", async (t) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/stdio.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client({ name: "stdio-test-client", version: "1.0.0" });

  t.after(async () => {
    await client.close();
  });

  await client.connect(transport);
  const listed = await client.listTools();

  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    [
      "get_hazard_profile",
      "list_disaster_declarations",
      "get_community_context",
    ],
  );
});
