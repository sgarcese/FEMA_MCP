export type Fetcher = typeof fetch;

export interface HazardLocationInput {
  fips?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
}

export interface HazardRisk {
  code: string;
  name: string;
  riskScore: number | null;
  riskRating: string | null;
  annualizedFrequency: number | null;
  expectedAnnualLossRating: string | null;
}

export interface HazardProfile {
  location: {
    granularity: "county" | "census_tract";
    state: string;
    stateAbbreviation: string;
    county: string;
    countyFips: string;
    tractFips: string | null;
  };
  overallRisk: {
    score: number | null;
    rating: string | null;
  };
  communityFactors: {
    socialVulnerability: { score: number | null; rating: string | null };
    communityResilience: { score: number | null; rating: string | null };
  };
  hazards: HazardRisk[];
  nriVersion: string;
  source: {
    name: string;
    url: string;
    retrievedAt: string;
  };
  caveat: string;
}

export interface DeclarationQuery {
  state?: string | undefined;
  countyFips?: string | undefined;
  fromYear?: number | undefined;
  toYear?: number | undefined;
  incidentType?: string | undefined;
  declarationType?: "DR" | "EM" | "FM" | undefined;
  limit?: number | undefined;
}

export interface DisasterDeclaration {
  declarationId: string;
  disasterNumber: number;
  state: string;
  countyFips: string | null;
  designatedArea: string;
  declarationType: string;
  declarationDate: string;
  incidentType: string;
  title: string;
  incidentBeginDate: string;
  incidentEndDate: string | null;
  tribalRequest: boolean;
  programs: {
    individualsAndHouseholds: boolean;
    individualAssistance: boolean;
    publicAssistance: boolean;
    hazardMitigation: boolean;
  };
  lastRefresh: string;
}

export interface DeclarationResults {
  declarations: DisasterDeclaration[];
  returned: number;
  source: {
    name: string;
    url: string;
    retrievedAt: string;
  };
  caveat: string;
}

export interface CommunityContext {
  hazardProfile: HazardProfile;
  declarationHistory: DeclarationResults;
  scope: {
    declarationYears: string;
    hazardCount: number;
  };
  safetyNote: string;
}
