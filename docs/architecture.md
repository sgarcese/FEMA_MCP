# Architecture

## Product boundary

FEMA Data MCP supplies sourced, machine-readable context for a separate emergency
planning application. The MCP identifies the hazards a community should plan for
and the types of federally declared incidents it has experienced. Household
needs, plan generation, report rendering, and live emergency instructions remain
outside this service.

## Current data flow

```text
MCP client
  -> stateless Streamable HTTP endpoint (src/index.ts)
     or stdio for locally launched clients (src/stdio.ts)
    -> task-shaped read-only tool
      -> FEMA National Risk Index layers on ArcGIS Online (county, tract)
      -> OpenFEMA API: DisasterDeclarationsSummaries v2
    <- compact JSON with provenance and safety caveats
```

Both transports wrap the same `createMcpServer()` and expose identical tools.
The stdio entry point writes only JSON-RPC to stdout; diagnostics go to stderr.
Neither process persists requests or responses. Location input is a FIPS
code or coordinates; street addresses are not accepted. Each upstream provider
is isolated behind a client so a FEMA endpoint can change without changing the
MCP contracts. Coordinates are sent to FEMA's ArcGIS service to identify the
containing Census tract, so privacy-sensitive clients should prefer a county or
tract FIPS when possible.

## Tool contracts

`get_hazard_profile` accepts county FIPS, tract FIPS, or coordinates. Coordinates
are spatially intersected with FEMA's Census-tract layer. Results rank applicable
hazards by NRI risk score and include the composite risk, social vulnerability,
community resilience, NRI version, source, retrieval time, and limitations.

`list_disaster_declarations` requires a state or county, caps results at 100, and
returns newest first. Filters are constructed from validated values rather than
accepting free-form OData.

`get_community_context` resolves the location through NRI, then uses its county
FIPS to retrieve a bounded declaration history. This gives planning clients one
small, coherent payload without duplicating data-joining logic.

## Reliability and security

- All tools are read-only and idempotent.
- `npm run check` runs in GitHub Actions on every pull request and push to
  `main`, and `main` requires it to pass.
- NRI county and tract layers publish different schemas, so each layer has its
  own requested field list (`NRI_LAYERS` in `src/clients/nri-client.ts`). ArcGIS
  rejects a query that names any field the layer lacks. `npm run test:live`
  checks the lists against the live layers nightly.
- Upstream calls time out after 15 seconds and translate upstream failures into
  recoverable MCP tool errors.
- Input schemas constrain FIPS codes, coordinates, years, enum values, and result
  sizes.
- Browser origins are denied unless explicitly configured. The MCP SDK validates
  supported protocol versions.
- No secrets, FEMA credentials, or household data are stored.

## Roadmap

Candidate sources are tracked as spike issues under epic
[#8](https://github.com/sgarcese/FEMA_MCP/issues/8). Each follows spike, owner
rulings, ADR, then build; nothing below is committed until the owner rules on
its spike. The order is a recommendation that weighs planning value against
cost, and the owner sets priority. Endpoints were checked on 2026-09-22.

1. **Tribal National Risk Index** ([#9](https://github.com/sgarcese/FEMA_MCP/issues/9)).
   `National_Risk_Index_Tribal_Counties` and `_Tribal_Census_Tracts` sit in the
   same ArcGIS Online organization as the current NRI layers. It closes a
   coverage gap where county and tract geography misrepresent tribal
   communities, and it reuses the existing client pattern. Schemas must be
   checked per layer (see #1).
2. **National Flood Hazard Layer** ([#10](https://github.com/sgarcese/FEMA_MCP/issues/10)).
   `hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer`. It tells a
   household whether a point falls in a mapped Special Flood Hazard Area, which
   the community-level NRI flood score can't. It needs explicit
   "not a flood insurance determination" limits and a separate reliability
   budget for a different host.
3. **National Weather Service active alerts** ([#11](https://github.com/sgarcese/FEMA_MCP/issues/11)).
   `api.weather.gov/alerts/active`. It answers "is anything happening now?"
   honestly, which FEMA's delayed IPAWS archive cannot. It's non-FEMA data, so
   the spike must decide whether it belongs in this server or a sibling, and
   how staleness is shown.
4. **Open shelters and Disaster Recovery Centers** ([#12](https://github.com/sgarcese/FEMA_MCP/issues/12)).
   `gis.fema.gov` `NSS/OpenShelters` (Red Cross sync, updates about every 20
   minutes) and `FEMA/DRC` (hourly). This is an operational "where do I go"
   mode with stricter freshness and safety wording than baseline preparedness.
5. **Hazard mitigation investments** ([#13](https://github.com/sgarcese/FEMA_MCP/issues/13)).
   OpenFEMA `HmaSubapplications` v2. The older `HazardMitigationAssistanceProjects`
   v4 was frozen on 2026-08-31 and will be removed on 2026-10-15, so it must not
   be used. It shows what a community has already funded to reduce risk.

### Deferred or excluded

- **Hosting and deployment**: deferred by the owner. No infrastructure exists
  yet; when it does, deployments run only from CI on `main`.
- **FEMA designated-county declaration maps**: excluded. Long-running
  declarations stay on the map, so presenting them as current would mislead
  (Spike 001).
- **IPAWS archive**: excluded as a live source; it is delayed by design.
- **Local evacuation zones, accessibility resources, utilities, schools, and
  community-specific instructions**: no consistent nationwide FEMA API exists.
  These need explicit local-source discovery and quality rules, not a generic
  web search tool.
