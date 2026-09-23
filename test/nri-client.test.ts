import assert from "node:assert/strict";
import test from "node:test";

import { NriClient } from "../src/clients/nri-client.js";

void test("gets a county hazard profile by FIPS and ranks hazards by risk score", async () => {
  let requestedUrl = "";
  const fetcher: typeof fetch = (input) => {
    requestedUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return Promise.resolve(
      Response.json({
        features: [
          {
            attributes: {
              STATE: "Massachusetts",
              STATEABBRV: "MA",
              COUNTY: "Essex",
              STCOFIPS: "25009",
              RISK_SCORE: 48.2,
              RISK_RATNG: "Relatively Moderate",
              SOVI_SCORE: 31.5,
              SOVI_RATNG: "Relatively Low",
              RESL_SCORE: 62.1,
              RESL_RATNG: "Relatively High",
              HRCN_RISKS: 83.4,
              HRCN_RISKR: "Relatively High",
              HRCN_AFREQ: 0.18,
              HRCN_EALR: "Relatively High",
              WNTW_RISKS: 57.2,
              WNTW_RISKR: "Relatively Moderate",
              WNTW_AFREQ: 0.62,
              WNTW_EALR: "Relatively Moderate",
              NRI_VER: "1.20.0",
            },
          },
        ],
      }),
    );
  };

  const profile = await new NriClient(fetcher).getHazardProfile({
    fips: "25009",
  });

  const url = new URL(requestedUrl);
  assert.match(url.pathname, /National_Risk_Index_Counties/);
  assert.equal(url.searchParams.get("where"), "STCOFIPS = '25009'");
  assert.equal(url.searchParams.get("returnGeometry"), "false");
  assert.equal(profile.location.countyFips, "25009");
  assert.equal(profile.nriVersion, "1.20.0");
  assert.equal(profile.hazards[0]?.name, "Hurricane");
  assert.equal(profile.hazards[0]?.annualizedFrequency, 0.18);
  assert.equal(profile.hazards[1]?.name, "Winter Weather");
  assert.equal(profile.hazards.length, 2);
});

void test("uses a point intersection against the tract layer for coordinates", async () => {
  let requestedUrl = "";
  const fetcher: typeof fetch = (input) => {
    requestedUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return Promise.resolve(
      Response.json({
        features: [
          {
            attributes: {
              STATE: "Massachusetts",
              STATEABBRV: "MA",
              COUNTY: "Middlesex",
              STCOFIPS: "25017",
              TRACTFIPS: "25017353102",
              RISK_SCORE: 51,
              RISK_RATNG: "Relatively Moderate",
              NRI_VER: "1.20.0",
            },
          },
        ],
      }),
    );
  };

  const profile = await new NriClient(fetcher).getHazardProfile({
    latitude: 42.3736,
    longitude: -71.1097,
  });

  const url = new URL(requestedUrl);
  assert.match(url.pathname, /National_Risk_Index_Census_Tracts/);
  assert.equal(url.searchParams.get("geometry"), "-71.1097,42.3736");
  assert.equal(url.searchParams.get("geometryType"), "esriGeometryPoint");
  assert.equal(url.searchParams.get("spatialRel"), "esriSpatialRelIntersects");
  assert.equal(profile.location.tractFips, "25017353102");
});

void test("rejects malformed location input before making a request", async () => {
  let called = false;
  const fetcher: typeof fetch = () => {
    called = true;
    return Promise.resolve(Response.json({}));
  };

  await assert.rejects(
    new NriClient(fetcher).getHazardProfile({ fips: "25' OR 1=1" }),
    /5-digit county or 11-digit Census tract FIPS/,
  );
  assert.equal(called, false);
});

function capturingFetcher(attributes: Record<string, unknown>) {
  const urls: URL[] = [];
  const fetcher: typeof fetch = (input) => {
    urls.push(
      new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      ),
    );
    return Promise.resolve(Response.json({ features: [{ attributes }] }));
  };
  return { fetcher, urls };
}

const tractAttributes = {
  STATE: "District of Columbia",
  STATEABBRV: "DC",
  COUNTY: "District of Columbia",
  STCOFIPS: "11001",
  TRACTFIPS: "11001980000",
  NRI_VER: "1.20.0",
};

function requestedOutFields(url: URL | undefined): string[] {
  return url?.searchParams.get("outFields")?.split(",") ?? [];
}

void test("does not request tract-only fields from the county layer (#1)", async () => {
  const { STCOFIPS, STATE, STATEABBRV, COUNTY, NRI_VER } = tractAttributes;
  const { fetcher, urls } = capturingFetcher({
    STATE,
    STATEABBRV,
    COUNTY,
    STCOFIPS,
    NRI_VER,
  });

  const profile = await new NriClient(fetcher).getHazardProfile({
    fips: "11001",
  });

  const outFields = requestedOutFields(urls[0]);
  assert.ok(outFields.includes("STCOFIPS"));
  assert.ok(!outFields.includes("TRACTFIPS"));
  assert.equal(profile.location.granularity, "county");
  assert.equal(profile.location.tractFips, null);
});

void test("requests tract fields for tract FIPS and coordinate lookups", async () => {
  const { fetcher, urls } = capturingFetcher(tractAttributes);
  const client = new NriClient(fetcher);

  await client.getHazardProfile({ fips: "11001980000" });
  await client.getHazardProfile({ latitude: 38.8977, longitude: -77.0365 });

  for (const url of urls) {
    assert.match(url.pathname, /National_Risk_Index_Census_Tracts/);
    assert.ok(requestedOutFields(url).includes("TRACTFIPS"));
  }
});
