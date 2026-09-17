import { queryArcGis } from "./arcgis.js";
import type {
  Fetcher,
  HazardLocationInput,
  HazardProfile,
  HazardRisk,
} from "../types.js";

const COUNTY_LAYER =
  "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0";
const TRACT_LAYER =
  "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0";
const SOURCE_URL =
  "https://www.fema.gov/about/openfema/data-sets/national-risk-index-data";

const HAZARDS = [
  ["AVLN", "Avalanche"],
  ["CFLD", "Coastal Flooding"],
  ["CWAV", "Cold Wave"],
  ["DRGT", "Drought"],
  ["ERQK", "Earthquake"],
  ["HAIL", "Hail"],
  ["HWAV", "Heat Wave"],
  ["HRCN", "Hurricane"],
  ["ISTM", "Ice Storm"],
  ["LNDS", "Landslide"],
  ["LTNG", "Lightning"],
  ["IFLD", "Inland Flooding"],
  ["SWND", "Strong Wind"],
  ["TRND", "Tornado"],
  ["TSUN", "Tsunami"],
  ["VLCN", "Volcanic Activity"],
  ["WFIR", "Wildfire"],
  ["WNTW", "Winter Weather"],
] as const;

const OUT_FIELDS = [
  "STATE",
  "STATEABBRV",
  "COUNTY",
  "STCOFIPS",
  "TRACTFIPS",
  "RISK_SCORE",
  "RISK_RATNG",
  "SOVI_SCORE",
  "SOVI_RATNG",
  "RESL_SCORE",
  "RESL_RATNG",
  "NRI_VER",
  ...HAZARDS.flatMap(([code]) => [
    `${code}_RISKS`,
    `${code}_RISKR`,
    `${code}_AFREQ`,
    `${code}_EALR`,
  ]),
].join(",");

type NriAttributes = Record<string, unknown>;

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requireText(attributes: NriAttributes, field: string): string {
  const value = textValue(attributes[field]);
  if (!value) throw new Error(`FEMA NRI response did not include ${field}`);
  return value;
}

function hazardsFrom(attributes: NriAttributes): HazardRisk[] {
  return HAZARDS.map(([code, name]) => ({
    code,
    name,
    riskScore: numberValue(attributes[`${code}_RISKS`]),
    riskRating: textValue(attributes[`${code}_RISKR`]),
    annualizedFrequency: numberValue(attributes[`${code}_AFREQ`]),
    expectedAnnualLossRating: textValue(attributes[`${code}_EALR`]),
  }))
    .filter(
      (hazard) =>
        hazard.riskScore !== null ||
        (hazard.riskRating !== null &&
          !/^(not applicable|no rating)$/i.test(hazard.riskRating)),
    )
    .sort((left, right) => (right.riskScore ?? -1) - (left.riskScore ?? -1));
}

export class NriClient {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async getHazardProfile(input: HazardLocationInput): Promise<HazardProfile> {
    const hasCoordinates =
      input.latitude !== undefined || input.longitude !== undefined;
    if (input.fips && hasCoordinates) {
      throw new Error("Provide either fips or coordinates, not both");
    }

    let endpoint: string;
    let parameters: Record<string, string>;
    let granularity: "county" | "census_tract";

    if (input.fips) {
      if (!/^\d{5}(?:\d{6})?$/.test(input.fips)) {
        throw new Error(
          "fips must be a 5-digit county or 11-digit Census tract FIPS code",
        );
      }
      granularity = input.fips.length === 5 ? "county" : "census_tract";
      endpoint = granularity === "county" ? COUNTY_LAYER : TRACT_LAYER;
      parameters = {
        where: `${granularity === "county" ? "STCOFIPS" : "TRACTFIPS"} = '${input.fips}'`,
        outFields: OUT_FIELDS,
      };
    } else {
      if (input.latitude === undefined || input.longitude === undefined) {
        throw new Error("Provide fips or both latitude and longitude");
      }
      if (input.latitude < -90 || input.latitude > 90) {
        throw new Error("latitude must be between -90 and 90");
      }
      if (input.longitude < -180 || input.longitude > 180) {
        throw new Error("longitude must be between -180 and 180");
      }
      granularity = "census_tract";
      endpoint = TRACT_LAYER;
      parameters = {
        where: "1=1",
        geometry: `${input.longitude},${input.latitude}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: OUT_FIELDS,
      };
    }

    const records = await queryArcGis<NriAttributes>(
      this.fetcher,
      endpoint,
      parameters,
    );
    const attributes = records[0];
    if (!attributes) {
      throw new Error("No FEMA National Risk Index area matched this location");
    }

    return {
      location: {
        granularity,
        state: requireText(attributes, "STATE"),
        stateAbbreviation: requireText(attributes, "STATEABBRV"),
        county: requireText(attributes, "COUNTY"),
        countyFips: requireText(attributes, "STCOFIPS"),
        tractFips: textValue(attributes.TRACTFIPS),
      },
      overallRisk: {
        score: numberValue(attributes.RISK_SCORE),
        rating: textValue(attributes.RISK_RATNG),
      },
      communityFactors: {
        socialVulnerability: {
          score: numberValue(attributes.SOVI_SCORE),
          rating: textValue(attributes.SOVI_RATNG),
        },
        communityResilience: {
          score: numberValue(attributes.RESL_SCORE),
          rating: textValue(attributes.RESL_RATNG),
        },
      },
      hazards: hazardsFrom(attributes),
      nriVersion: requireText(attributes, "NRI_VER"),
      source: {
        name: "FEMA National Risk Index",
        url: SOURCE_URL,
        retrievedAt: new Date().toISOString(),
      },
      caveat:
        "National Risk Index scores are relative planning baselines, not real-time forecasts, evacuation orders, or proof that a specific property is safe or unsafe.",
    };
  }
}
