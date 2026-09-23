# ADR 0001: Initial MCP architecture

- Status: Accepted for the initial vertical slice; transport amended by
  [ADR 0002](0002-stdio-transport.md)
- Date: 2026-09-17

## Context

The service must support planning applications across the United States, expose
a small number of understandable operations, and avoid coupling clients to raw
FEMA query languages. The intended consumers include a future public web
application and remote MCP clients.

## Decision

Build a stateless remote Streamable HTTP MCP server with the official TypeScript
SDK. Publish one read-only tool per user task. Use live, authoritative FEMA
sources through provider-specific adapters:

- NRI v1.20 county and Census-tract feature services for baseline natural-hazard
  risk
- OpenFEMA Disaster Declarations Summaries v2 for historical federal declaration
  context

Accept FIPS identifiers or coordinates, not street addresses. Keep live alerts,
household-plan generation, and report rendering outside the initial MCP.

## Consequences

- Clients get stable, compact contracts instead of ArcGIS and OData details.
- The initial service needs no API keys or database.
- Availability depends on FEMA's public endpoints, so timeouts, provenance, and
  replaceable adapters are required.
- NRI is relative community-level risk and cannot answer property-level or
  real-time safety questions.
- Authentication can be added at the deployment edge later without changing the
  tool contracts.
