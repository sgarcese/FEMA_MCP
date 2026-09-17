import type {
  CommunityContext,
  DeclarationQuery,
  DeclarationResults,
  HazardLocationInput,
  HazardProfile,
} from "../types.js";

export interface HazardProfileProvider {
  getHazardProfile(input: HazardLocationInput): Promise<HazardProfile>;
}

export interface DeclarationProvider {
  listDeclarations(input: DeclarationQuery): Promise<DeclarationResults>;
}

interface ContextOptions {
  yearsBack?: number;
  declarationLimit?: number;
  hazardLimit?: number;
}

export class CommunityContextService {
  constructor(
    private readonly nri: HazardProfileProvider,
    private readonly declarations: DeclarationProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getContext(
    location: HazardLocationInput,
    options: ContextOptions = {},
  ): Promise<CommunityContext> {
    const yearsBack = Math.min(Math.max(options.yearsBack ?? 30, 1), 74);
    const declarationLimit = Math.min(
      Math.max(options.declarationLimit ?? 25, 1),
      100,
    );
    const hazardLimit = Math.min(Math.max(options.hazardLimit ?? 10, 1), 18);
    const currentYear = this.now().getUTCFullYear();
    const fromYear = currentYear - yearsBack + 1;

    const fullProfile = await this.nri.getHazardProfile(location);
    const declarationHistory = await this.declarations.listDeclarations({
      countyFips: fullProfile.location.countyFips,
      fromYear,
      toYear: currentYear,
      limit: declarationLimit,
    });
    const hazardProfile = {
      ...fullProfile,
      hazards: fullProfile.hazards.slice(0, hazardLimit),
    };

    return {
      hazardProfile,
      declarationHistory,
      scope: {
        declarationYears: `${fromYear}–${currentYear}`,
        hazardCount: hazardProfile.hazards.length,
      },
      safetyNote:
        "Use this planning context with current guidance from local emergency management, weather services, and public alerting authorities.",
    };
  }
}
