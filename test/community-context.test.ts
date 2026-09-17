import assert from "node:assert/strict";
import test from "node:test";

import { CommunityContextService } from "../src/services/community-context.js";
import type {
  DeclarationQuery,
  DeclarationResults,
  HazardProfile,
} from "../src/types.js";

const profile: HazardProfile = {
  location: {
    granularity: "census_tract",
    state: "Massachusetts",
    stateAbbreviation: "MA",
    county: "Essex",
    countyFips: "25009",
    tractFips: "25009201100",
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

const declarationResults: DeclarationResults = {
  declarations: [],
  returned: 0,
  source: {
    name: "OpenFEMA",
    url: "https://example.test/openfema",
    retrievedAt: "2026-01-01",
  },
  caveat: "not an alert",
};

void test("uses the hazard result county to retrieve declaration history", async () => {
  let declarationInput: DeclarationQuery | undefined;
  const service = new CommunityContextService(
    { getHazardProfile: () => Promise.resolve(profile) },
    {
      listDeclarations: (input) => {
        declarationInput = input;
        return Promise.resolve(declarationResults);
      },
    },
    () => new Date("2026-09-17T00:00:00Z"),
  );

  const result = await service.getContext(
    { latitude: 42.52, longitude: -70.9 },
    { yearsBack: 20, declarationLimit: 10, hazardLimit: 5 },
  );

  assert.deepEqual(declarationInput, {
    countyFips: "25009",
    fromYear: 2007,
    toYear: 2026,
    limit: 10,
  });
  assert.equal(result.hazardProfile.location.tractFips, "25009201100");
  assert.equal(result.scope.declarationYears, "2007–2026");
});
