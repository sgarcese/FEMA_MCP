import type {
  DeclarationQuery,
  DeclarationResults,
  DisasterDeclaration,
  Fetcher,
} from "../types.js";

const ENDPOINT =
  "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries";
const SOURCE_URL =
  "https://www.fema.gov/about/openfema/disaster-declarations-summaries";

const STATE_BY_FIPS: Record<string, string> = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
  "60": "AS",
  "66": "GU",
  "69": "MP",
  "72": "PR",
  "78": "VI",
};

interface OpenFemaRecord {
  femaDeclarationString: string;
  disasterNumber: number;
  state: string;
  declarationType: string;
  declarationDate: string;
  incidentType: string;
  declarationTitle: string;
  designatedArea: string;
  fipsStateCode?: string | null;
  fipsCountyCode?: string | null;
  incidentBeginDate: string;
  incidentEndDate?: string | null;
  ihProgramDeclared?: boolean;
  iaProgramDeclared?: boolean;
  paProgramDeclared?: boolean;
  hmProgramDeclared?: boolean;
  tribalRequest?: boolean;
  lastRefresh: string;
}

interface OpenFemaResponse {
  DisasterDeclarationsSummaries?: OpenFemaRecord[];
  error?: { message?: string };
}

function mapRecord(record: OpenFemaRecord): DisasterDeclaration {
  const stateFips = record.fipsStateCode?.padStart(2, "0");
  const countyCode = record.fipsCountyCode?.padStart(3, "0");
  return {
    declarationId: record.femaDeclarationString,
    disasterNumber: record.disasterNumber,
    state: record.state,
    countyFips: stateFips && countyCode ? `${stateFips}${countyCode}` : null,
    designatedArea: record.designatedArea,
    declarationType: record.declarationType,
    declarationDate: record.declarationDate,
    incidentType: record.incidentType,
    title: record.declarationTitle,
    incidentBeginDate: record.incidentBeginDate,
    incidentEndDate: record.incidentEndDate ?? null,
    tribalRequest: record.tribalRequest ?? false,
    programs: {
      individualsAndHouseholds: record.ihProgramDeclared ?? false,
      individualAssistance: record.iaProgramDeclared ?? false,
      publicAssistance: record.paProgramDeclared ?? false,
      hazardMitigation: record.hmProgramDeclared ?? false,
    },
    lastRefresh: record.lastRefresh,
  };
}

export class OpenFemaClient {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async listDeclarations(input: DeclarationQuery): Promise<DeclarationResults> {
    if (!input.state && !input.countyFips) {
      throw new Error(
        "Provide state or countyFips to bound the declaration search",
      );
    }
    if (input.state && !/^[A-Za-z]{2}$/.test(input.state)) {
      throw new Error("state must be a two-letter U.S. postal abbreviation");
    }
    if (input.countyFips && !/^\d{5}$/.test(input.countyFips)) {
      throw new Error("countyFips must be a 5-digit county FIPS code");
    }
    if (
      input.fromYear !== undefined &&
      input.toYear !== undefined &&
      input.fromYear > input.toYear
    ) {
      throw new Error("fromYear must not be later than toYear");
    }

    const currentYear = new Date().getUTCFullYear();
    for (const [name, year] of [
      ["fromYear", input.fromYear],
      ["toYear", input.toYear],
    ] as const) {
      if (
        year !== undefined &&
        (!Number.isInteger(year) || year < 1953 || year > currentYear + 1)
      ) {
        throw new Error(
          `${name} must be an integer between 1953 and ${currentYear + 1}`,
        );
      }
    }

    const filters: string[] = [];
    let state = input.state?.toUpperCase();
    if (input.countyFips) {
      state = STATE_BY_FIPS[input.countyFips.slice(0, 2)];
      if (!state)
        throw new Error("countyFips has an unknown state or territory code");
      filters.push(`fipsCountyCode eq '${input.countyFips.slice(2)}'`);
    }
    if (state) filters.unshift(`state eq '${state}'`);
    if (input.fromYear !== undefined) {
      filters.push(
        `declarationDate ge '${input.fromYear}-01-01T00:00:00.000Z'`,
      );
    }
    if (input.toYear !== undefined) {
      filters.push(
        `declarationDate lt '${input.toYear + 1}-01-01T00:00:00.000Z'`,
      );
    }
    if (input.incidentType) {
      const safeIncidentType = input.incidentType.replaceAll("'", "''");
      filters.push(`incidentType eq '${safeIncidentType}'`);
    }
    if (input.declarationType) {
      filters.push(`declarationType eq '${input.declarationType}'`);
    }

    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({
      $filter: filters.join(" and "),
      $orderby: "declarationDate desc",
      $top: String(limit),
    }).toString();

    const response = await this.fetcher(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`OpenFEMA request failed with HTTP ${response.status}`);
    const body = (await response.json()) as OpenFemaResponse;
    if (body.error)
      throw new Error(
        `OpenFEMA error: ${body.error.message ?? "unknown error"}`,
      );
    const declarations = (body.DisasterDeclarationsSummaries ?? []).map(
      mapRecord,
    );

    return {
      declarations,
      returned: declarations.length,
      source: {
        name: "OpenFEMA Disaster Declarations Summaries",
        url: SOURCE_URL,
        retrievedAt: new Date().toISOString(),
      },
      caveat:
        "A federal disaster declaration is historical and administrative context; it is not a real-time alert, forecast, or local evacuation instruction.",
    };
  }
}
