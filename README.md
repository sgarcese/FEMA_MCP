# FEMA Data MCP

A read-only Model Context Protocol server that exposes nationwide FEMA data for
building clear, location-aware household emergency preparedness plans.

The first release focuses on durable planning context rather than live incident
response:

- FEMA National Risk Index v1.20 hazard profiles at county or Census-tract level
- OpenFEMA disaster declaration history by state or county
- A combined community context packet for downstream planning applications

This server does **not** produce evacuation guidance, forecasts, property-level
risk determinations, or real-time emergency alerts.

## MCP tools

| Tool                         | Purpose                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `get_hazard_profile`         | Rank FEMA's 18 natural hazards for a county or Census tract, including overall risk, social vulnerability, and community resilience. |
| `list_disaster_declarations` | Find FEMA declarations by state or county, date range, incident type, and declaration type.                                          |
| `get_community_context`      | Combine the hazard profile with recent county declaration history in one planning-oriented response.                                 |

Locations can be supplied as a 5-digit county FIPS, an 11-digit Census tract
FIPS, or latitude/longitude. The MCP intentionally does not collect or geocode a
street address. Coordinate queries are transmitted to FEMA's ArcGIS service;
use a county or tract FIPS instead when precise coordinates are unnecessary.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env
npm run check
npm run dev
```

Health check: `GET http://localhost:3000/health`

MCP endpoint: `POST http://localhost:3000/mcp`

To inspect the tools interactively:

```bash
npx @modelcontextprotocol/inspector
```

Choose Streamable HTTP and connect to `http://localhost:3000/mcp`.

### Claude Desktop over stdio

Build the server before configuring Claude Desktop:

```bash
npm install
npm run build
```

Add an entry like this to `claude_desktop_config.json`, replacing both paths
with absolute paths on your machine:

```json
{
  "mcpServers": {
    "fema-data": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/FEMA_MCP/dist/stdio.js"]
    }
  }
}
```

Claude Desktop launches this process itself, so do not run `npm run dev` at
the same time. The stdio and HTTP entry points expose the same FEMA tools.

## Configuration

- `PORT` — listening port; defaults to `3000`.
- `ALLOWED_ORIGINS` — comma-separated browser origins permitted to call `/mcp`.
  Requests without an `Origin` header, such as normal server-side MCP clients,
  remain supported.

No FEMA API key is required. Upstream requests have a 15-second timeout and all
responses include source provenance and a safety caveat.

## Data sources and scope

- [FEMA National Risk Index](https://www.fema.gov/about/openfema/data-sets/national-risk-index-data)
  provides relative risk, expected annual loss, social vulnerability, and
  community resilience at county and Census-tract resolution.
- [OpenFEMA Disaster Declarations Summaries](https://www.fema.gov/about/openfema/disaster-declarations-summaries)
  provides federal declarations beginning in 1953.

Risk scores are planning baselines, not predictions. A federal declaration is
administrative and historical context, not evidence that an emergency is active.
Any eventual planning product must pair these results with current instructions
from local emergency management and alerting authorities.

See [the architecture](docs/architecture.md) for boundaries and the planned data
surface.

## Development workflow

The project uses a test-first workflow, keeps changes reviewable, and deploys
only through CI after merge. Canonical commands are:

```bash
npm test
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run check
```

`npm test` never calls FEMA. `npm run test:live` runs opt-in contract tests
against both upstream sources. For the National Risk Index ArcGIS layers, it
checks that every requested field is published on each layer and makes real
county, tract, and coordinate lookups. For OpenFEMA Disaster Declarations
Summaries v2, it checks that every field the client selects is published and
that OpenFEMA hasn't announced a deprecation, then makes real state and county
queries. Run it after changing either client's field lists.

GitHub Actions runs `npm run check` on every pull request and push to `main`
(`.github/workflows/ci.yml`). `main` is protected: changes land only through
pull requests, the `npm run check` job must pass on a branch that is up to date
with `main`, review conversations must be resolved, and admins are not exempt. A separate nightly
workflow (`.github/workflows/live-contract.yml`, also manually dispatchable)
runs the live FEMA contract tests so upstream schema changes surface without
blocking pull requests.

Dependabot (`.github/dependabot.yml`) opens weekly update PRs for npm packages
and GitHub Actions. Minor and patch bumps are grouped and majors arrive
separately; every update goes through the same required `npm run check` gate.
Merged branches are deleted automatically.

## License

Released under the [MIT License](LICENSE).
