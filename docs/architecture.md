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
  -> stateless Streamable HTTP endpoint
    -> task-shaped read-only tool
      -> FEMA National Risk Index ArcGIS Feature Service
      -> OpenFEMA DisasterDeclarationsSummaries v2
    <- compact JSON with provenance and safety caveats
```

The HTTP process does not persist requests or responses. Location input is a FIPS
code or coordinates; street addresses are not accepted. Each upstream provider
is isolated behind a client so a FEMA endpoint can change without changing the
MCP contracts. Coordinates are sent to FEMA's ArcGIS service to identify the
containing Census tract, so privacy-sensitive clients should prefer a county or
tract FIPS when possible.

## Initial contracts

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
- Upstream calls time out after 15 seconds and translate upstream failures into
  recoverable MCP tool errors.
- Input schemas constrain FIPS codes, coordinates, years, enum values, and result
  sizes.
- Browser origins are denied unless explicitly configured. The MCP SDK validates
  supported protocol versions.
- No secrets, FEMA credentials, or household data are stored.

## Planned data surface

The next candidates should be added only when they improve a concrete planning
decision:

1. FEMA National Flood Hazard Layer for address-adjacent flood-zone context,
   with explicit property-level limitations.
2. FEMA shelter and Disaster Recovery Center feeds for a separate operational
   mode; freshness and availability semantics must be clear.
3. Hazard Mitigation Assistance projects to show local mitigation investments.
4. Tribal NRI county and tract datasets where standard Census geography is not
   the right community representation.
5. A non-FEMA live-alert provider, likely the National Weather Service, behind a
   clearly separate tool family. FEMA's IPAWS archive is delayed and must not be
   presented as a live alert source.

Local evacuation zones, accessibility resources, utilities, schools, and
community-specific instructions are not consistently available through one
nationwide FEMA API. Those will require explicit local-source discovery and
quality rules rather than a generic web search tool.
