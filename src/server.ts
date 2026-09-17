import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { NriClient } from "./clients/nri-client.js";
import { OpenFemaClient } from "./clients/open-fema-client.js";
import {
  CommunityContextService,
  type DeclarationProvider,
  type HazardProfileProvider,
} from "./services/community-context.js";

interface ServerDependencies {
  nri?: HazardProfileProvider;
  declarations?: DeclarationProvider;
  now?: () => Date;
}

const readOnlyAnnotations = (title: string) => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});

const locationSchema = {
  fips: z
    .string()
    .regex(/^\d{5}(?:\d{6})?$/)
    .optional()
    .describe(
      "A 5-digit county or 11-digit Census tract FIPS code. Do not combine with coordinates.",
    ),
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .optional()
    .describe(
      "WGS84 latitude. Must be provided together with longitude and without fips.",
    ),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .optional()
    .describe(
      "WGS84 longitude. Must be provided together with latitude and without fips.",
    ),
};

function jsonResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function errorResult(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown FEMA data error";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

export function createMcpServer(
  dependencies: ServerDependencies = {},
): McpServer {
  const nri = dependencies.nri ?? new NriClient();
  const declarations = dependencies.declarations ?? new OpenFemaClient();
  const context = new CommunityContextService(
    nri,
    declarations,
    dependencies.now,
  );
  const server = new McpServer(
    { name: "fema-data-mcp", version: "0.1.0" },
    {
      instructions:
        "Provides planning-oriented FEMA hazard risk and disaster declaration context. Results are not real-time alerts or evacuation guidance.",
    },
  );

  server.registerTool(
    "get_hazard_profile",
    {
      description:
        "Get FEMA National Risk Index v1.20 hazard scores for one U.S. county or Census tract. Accepts a FIPS code or coordinates and returns ranked natural hazards plus vulnerability and resilience context. Does not return forecasts, alerts, or property-level determinations.",
      inputSchema: {
        ...locationSchema,
        max_hazards: z
          .number()
          .int()
          .min(1)
          .max(18)
          .default(10)
          .describe(
            "Maximum ranked hazards to return; FEMA evaluates 18 hazard types.",
          ),
      },
      annotations: readOnlyAnnotations("Get FEMA hazard profile"),
    },
    async ({ fips, latitude, longitude, max_hazards }) => {
      try {
        const profile = await nri.getHazardProfile({
          fips,
          latitude,
          longitude,
        });
        return jsonResult({
          ...profile,
          hazards: profile.hazards.slice(0, max_hazards),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_disaster_declarations",
    {
      description:
        "List FEMA disaster declarations for a U.S. state or county, optionally bounded by year and incident or declaration type. Returns declaration dates, incident details, and assistance program flags. This is historical administrative data, not a live alert feed.",
      inputSchema: {
        state: z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .optional()
          .describe(
            "Two-letter U.S. state or territory abbreviation. Optional when county_fips is provided.",
          ),
        county_fips: z
          .string()
          .regex(/^\d{5}$/)
          .optional()
          .describe(
            "Five-digit county FIPS code. Narrows results and determines the state.",
          ),
        from_year: z
          .number()
          .int()
          .min(1953)
          .optional()
          .describe(
            "First declaration year to include. FEMA declaration records begin in 1953.",
          ),
        to_year: z
          .number()
          .int()
          .min(1953)
          .optional()
          .describe("Last declaration year to include."),
        incident_type: z
          .string()
          .min(1)
          .max(80)
          .optional()
          .describe(
            "Exact OpenFEMA incident type, such as Flood, Hurricane, Fire, or Severe Storm.",
          ),
        declaration_type: z
          .enum(["DR", "EM", "FM"])
          .optional()
          .describe(
            "DR for major disaster, EM for emergency, or FM for fire management assistance.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Maximum declarations to return, newest first."),
      },
      annotations: readOnlyAnnotations("List FEMA disaster declarations"),
    },
    async ({
      state,
      county_fips,
      from_year,
      to_year,
      incident_type,
      declaration_type,
      limit,
    }) => {
      try {
        return jsonResult(
          await declarations.listDeclarations({
            state,
            countyFips: county_fips,
            fromYear: from_year,
            toYear: to_year,
            incidentType: incident_type,
            declarationType: declaration_type,
            limit,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_community_context",
    {
      description:
        "Build a compact preparedness data packet for one U.S. location by combining its ranked FEMA hazard profile with recent county disaster declarations. Returns source provenance and safety caveats; it does not create a household plan or provide live emergency instructions.",
      inputSchema: {
        ...locationSchema,
        years_back: z
          .number()
          .int()
          .min(1)
          .max(74)
          .default(30)
          .describe(
            "Number of calendar years of declaration history to include.",
          ),
        max_hazards: z
          .number()
          .int()
          .min(1)
          .max(18)
          .default(10)
          .describe("Maximum ranked hazards."),
        max_declarations: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Maximum declarations, newest first."),
      },
      annotations: readOnlyAnnotations(
        "Get FEMA community preparedness context",
      ),
    },
    async ({
      fips,
      latitude,
      longitude,
      years_back,
      max_hazards,
      max_declarations,
    }) => {
      try {
        return jsonResult(
          await context.getContext(
            { fips, latitude, longitude },
            {
              yearsBack: years_back,
              hazardLimit: max_hazards,
              declarationLimit: max_declarations,
            },
          ),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
