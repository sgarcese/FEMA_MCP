import assert from "node:assert/strict";
import test from "node:test";

import {
  OPEN_FEMA_DECLARATION_FIELDS,
  OpenFemaClient,
} from "../src/clients/open-fema-client.js";

void test("queries declaration history with bounded, encoded filters", async () => {
  let requestedUrl = "";
  const fetcher: typeof fetch = (input) => {
    requestedUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return Promise.resolve(
      Response.json({
        metadata: { count: 1 },
        DisasterDeclarationsSummaries: [
          {
            femaDeclarationString: "DR-1234-MA",
            disasterNumber: 1234,
            state: "MA",
            declarationType: "DR",
            declarationDate: "2020-03-13T00:00:00.000Z",
            incidentType: "Biological",
            declarationTitle: "COVID-19 PANDEMIC",
            designatedArea: "Essex (County)",
            fipsStateCode: "25",
            fipsCountyCode: "009",
            incidentBeginDate: "2020-01-20T00:00:00.000Z",
            incidentEndDate: "2023-05-11T00:00:00.000Z",
            ihProgramDeclared: false,
            iaProgramDeclared: true,
            paProgramDeclared: true,
            hmProgramDeclared: false,
            tribalRequest: false,
            lastRefresh: "2025-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
  };

  const result = await new OpenFemaClient(fetcher).listDeclarations({
    countyFips: "25009",
    fromYear: 2019,
    toYear: 2021,
    limit: 25,
  });

  const url = new URL(requestedUrl);
  const filter = url.searchParams.get("$filter") ?? "";
  assert.match(filter, /state eq 'MA'/);
  assert.match(filter, /fipsCountyCode eq '009'/);
  assert.match(filter, /declarationDate ge '2019-01-01T00:00:00.000Z'/);
  assert.match(filter, /declarationDate lt '2022-01-01T00:00:00.000Z'/);
  assert.equal(url.searchParams.get("$top"), "25");
  assert.equal(url.searchParams.get("$orderby"), "declarationDate desc");
  assert.equal(result.declarations[0]?.countyFips, "25009");
  assert.equal(result.declarations[0]?.programs.individualAssistance, true);
});

void test("requires a state or county and validates the year range", async () => {
  const client = new OpenFemaClient(() => Promise.resolve(Response.json({})));

  await assert.rejects(client.listDeclarations({}), /state or countyFips/);
  await assert.rejects(
    client.listDeclarations({ state: "MA", fromYear: 2022, toYear: 2020 }),
    /fromYear must not be later than toYear/,
  );
});

void test("selects exactly the fields the client maps and filters on", async () => {
  let requestedUrl: URL | undefined;
  const fetcher: typeof fetch = (input) => {
    requestedUrl = new URL(input instanceof Request ? input.url : input);
    return Promise.resolve(
      Response.json({ DisasterDeclarationsSummaries: [] }),
    );
  };

  await new OpenFemaClient(fetcher).listDeclarations({ countyFips: "11001" });

  const selected = requestedUrl?.searchParams.get("$select")?.split(",");
  assert.deepEqual(selected, [...OPEN_FEMA_DECLARATION_FIELDS]);
  for (const filtered of ["state", "fipsCountyCode", "declarationDate"]) {
    assert.ok(selected?.includes(filtered), `${filtered} is not selected`);
  }
});

void test("surfaces OpenFEMA's error message on a rejected query", async () => {
  const fetcher: typeof fetch = () =>
    Promise.resolve(
      Response.json(
        {
          error: [
            {
              name: "OData Query Parser Error",
              message:
                'Criteria includes field "x" not found in the data model.',
            },
          ],
        },
        { status: 400 },
      ),
    );

  await assert.rejects(
    new OpenFemaClient(fetcher).listDeclarations({ state: "DC" }),
    /HTTP 400.*field "x" not found in the data model/,
  );
});
