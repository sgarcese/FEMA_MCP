import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import {
  OPEN_FEMA_DECLARATIONS_URL,
  OPEN_FEMA_DECLARATION_FIELDS,
  OpenFemaClient,
} from "../src/clients/open-fema-client.js";

// Live contract checks against OpenFEMA. Opt in with FEMA_LIVE=1
// (npm run test:live); skipped by default so `npm test` stays hermetic.
const skip = process.env.FEMA_LIVE === "1" ? false : "set FEMA_LIVE=1";

interface RawResponse {
  metadata?: { DeprecationInformation?: { depApiMessage?: string } };
  DisasterDeclarationsSummaries?: Array<Record<string, unknown>>;
}

void test(
  "OpenFEMA declarations v2 is not deprecated and publishes every selected field",
  { skip },
  async () => {
    // No $select: inspect the full published record, so a renamed field shows
    // up as missing here rather than as a 400 from the client's own query.
    const url = new URL(OPEN_FEMA_DECLARATIONS_URL);
    url.search = new URLSearchParams({
      $filter: "state eq 'DC' and fipsCountyCode eq '001'",
      $top: "1",
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.ok, true, `HTTP ${response.status}`);
    const body = (await response.json()) as RawResponse;

    const deprecation = body.metadata?.DeprecationInformation;
    assert.equal(
      deprecation,
      undefined,
      `OpenFEMA deprecation notice: ${deprecation?.depApiMessage ?? ""}`,
    );

    const record = body.DisasterDeclarationsSummaries?.[0];
    assert.ok(record, "no DC declaration returned");
    const missing = OPEN_FEMA_DECLARATION_FIELDS.filter(
      (field) => !(field in record),
    );
    assert.deepEqual(missing, [], `record lacks ${missing.join(", ")}`);
  },
);

void test(
  "OpenFEMA declaration lookups succeed live for state and county",
  { skip },
  async () => {
    const client = new OpenFemaClient();

    const state = await client.listDeclarations({ state: "CA", limit: 5 });
    assert.equal(state.returned, 5);
    for (const declaration of state.declarations) {
      assert.equal(declaration.state, "CA");
      assert.match(declaration.declarationId, /^[A-Z]{2}-\d+-CA$/);
    }

    const county = await client.listDeclarations({
      countyFips: "11001",
      limit: 5,
    });
    assert.ok(county.returned > 0);
    for (const declaration of county.declarations) {
      assert.equal(declaration.countyFips, "11001");
    }
  },
);
