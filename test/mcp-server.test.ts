import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../src/server.js";
import type { DeclarationResults, HazardProfile } from "../src/types.js";

const profile: HazardProfile = {
  location: {
    granularity: "county",
    state: "Massachusetts",
    stateAbbreviation: "MA",
    county: "Essex",
    countyFips: "25009",
    tractFips: null,
  },
  overallRisk: { score: 50, rating: "Relatively Moderate" },
  communityFactors: {
    socialVulnerability: { score: 40, rating: "Relatively Moderate" },
    communityResilience: { score: 60, rating: "Relatively High" },
  },
  hazards: [],
  nriVersion: "1.20.0",
  source: {
    name: "NRI",
    url: "https://example.test/nri",
    retrievedAt: "2026-01-01",
  },
  caveat: "baseline only",
};

const declarations: DeclarationResults = {
  declarations: [],
  returned: 0,
  source: {
    name: "OpenFEMA",
    url: "https://example.test/openfema",
    retrievedAt: "2026-01-01",
  },
  caveat: "not an alert",
};

void test("publishes three narrowly scoped, read-only tools", async (t) => {
  const server = createMcpServer({
    nri: { getHazardProfile: () => Promise.resolve(profile) },
    declarations: { listDeclarations: () => Promise.resolve(declarations) },
    now: () => new Date("2026-09-17T00:00:00Z"),
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    [
      "get_hazard_profile",
      "list_disaster_declarations",
      "get_community_context",
    ],
  );
  for (const tool of listed.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.ok(tool.annotations?.title);
  }

  const called = await client.callTool({
    name: "get_hazard_profile",
    arguments: { fips: "25009", max_hazards: 5 },
  });
  assert.equal(called.isError, undefined);
  assert.ok(Array.isArray(called.content));
  const content = called.content as Array<{ type: string; text?: string }>;
  const text = content.find((item) => item.type === "text");
  assert.ok(text && "text" in text);
  const parsed = JSON.parse(text.text ?? "{}") as {
    location: { countyFips: string };
  };
  assert.equal(parsed.location.countyFips, "25009");
});
