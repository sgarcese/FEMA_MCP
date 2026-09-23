import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { NRI_LAYERS, NriClient } from "../src/clients/nri-client.js";

// Live contract checks against FEMA's hosted NRI layers. Opt in with
// FEMA_LIVE=1 (npm run test:live); skipped by default so `npm test` stays
// hermetic.
const skip = process.env.FEMA_LIVE === "1" ? false : "set FEMA_LIVE=1";

interface LayerMetadata {
  fields?: Array<{ name: string }>;
  error?: { message?: string };
}

for (const [granularity, layer] of Object.entries(NRI_LAYERS)) {
  void test(
    `NRI ${granularity} layer publishes every requested field`,
    { skip },
    async () => {
      const response = await fetch(`${layer.url}?f=json`, {
        signal: AbortSignal.timeout(15_000),
      });
      assert.equal(response.ok, true, `HTTP ${response.status}`);
      const metadata = (await response.json()) as LayerMetadata;
      assert.equal(metadata.error, undefined, metadata.error?.message);

      const published = new Set(metadata.fields?.map((field) => field.name));
      const missing = [layer.idField, ...layer.outFields].filter(
        (field) => !published.has(field),
      );
      assert.deepEqual(
        missing,
        [],
        `${granularity} layer lacks ${missing.join(", ")}`,
      );
    },
  );
}

void test(
  "NRI lookups succeed live for county, tract, and coordinates",
  { skip },
  async () => {
    const client = new NriClient();

    const county = await client.getHazardProfile({ fips: "11001" });
    assert.equal(county.location.granularity, "county");
    assert.equal(county.location.countyFips, "11001");
    assert.equal(county.location.tractFips, null);
    assert.ok(county.hazards.length > 0);

    const tract = await client.getHazardProfile({ fips: "11001980000" });
    assert.equal(tract.location.tractFips, "11001980000");

    const point = await client.getHazardProfile({
      latitude: 38.8977,
      longitude: -77.0365,
    });
    assert.equal(point.location.countyFips, "11001");
    assert.match(point.location.tractFips ?? "", /^11001\d{6}$/);
  },
);
