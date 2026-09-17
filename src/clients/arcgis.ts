import type { Fetcher } from "../types.js";

interface ArcGisResponse<T> {
  features?: Array<{ attributes: T }>;
  error?: { code?: number; message?: string; details?: string[] };
}

export async function queryArcGis<T>(
  fetcher: Fetcher,
  endpoint: string,
  parameters: Record<string, string>,
): Promise<T[]> {
  const url = new URL(`${endpoint}/query`);
  url.search = new URLSearchParams({
    f: "json",
    outFields: "*",
    returnGeometry: "false",
    ...parameters,
  }).toString();

  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`FEMA ArcGIS request failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as ArcGisResponse<T>;
  if (body.error) {
    const details = body.error.details?.join("; ");
    throw new Error(
      `FEMA ArcGIS error${body.error.code ? ` ${body.error.code}` : ""}: ${body.error.message ?? "unknown error"}${details ? ` (${details})` : ""}`,
    );
  }
  return body.features?.map((feature) => feature.attributes) ?? [];
}
