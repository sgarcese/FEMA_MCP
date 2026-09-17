# Spike 001: FEMA data sources for household preparedness

## Outcome

The highest-value first slice is the intersection of baseline hazard risk and
historical disaster experience. Both are authoritative, nationwide, machine
readable, and useful before the downstream planning application exists.

## Sources assessed

### National Risk Index v1.20

FEMA provides county and Census-tract records for 18 natural hazards, including
relative risk, expected annual loss, social vulnerability, and community
resilience. FEMA retired the old NRI application and publishes the December 2025
v1.20 data through OpenFEMA downloads and FEMA-owned ArcGIS feature services used
by RAPT. The feature services are suitable for point and FIPS queries without
shipping the full tract table.

Decision: include now.

### Disaster Declarations Summaries

OpenFEMA provides federal major disaster, emergency, and fire-management
declarations beginning in 1953. It is useful as historical and administrative
context but cannot establish whether a local threat is currently active.

Decision: include now with an explicit caveat.

### Current declaration maps

FEMA's designated-county map layers include counties attached to declarations,
but long-running declarations can remain present. Calling this a current hazard
feed would be misleading.

Decision: defer until the product defines a precise operational use and status
semantics.

### IPAWS archive

The public FEMA GIS archive is delayed and describes itself as an archive. It is
not appropriate for active alerts.

Decision: exclude from live functionality; evaluate National Weather Service or
another official alert source in a separate phase.

### Shelters, recovery centers, mitigation projects, and flood layers

These can help with operational response, recovery, or property-adjacent
planning, but each needs freshness, coverage, and interpretation rules.

Decision: retain as explicit roadmap candidates rather than widening the first
tool surface.
