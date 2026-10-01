export type GeoHit = { label: string; lat: number; lng: number };

type NominatimHit = { display_name?: string; lat?: string; lon?: string };

export function parseNominatim(rows: NominatimHit[]): GeoHit[] {
  const hits: GeoHit[] = [];
  for (const row of rows) {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    const label = row.display_name?.trim() ?? '';
    if (!label || Number.isNaN(lat) || Number.isNaN(lng)) continue;
    hits.push({ label: label.slice(0, 160), lat, lng });
  }
  return hits;
}

async function nominatim(path: string, params: Record<string, string>): Promise<NominatimHit | NominatimHit[]> {
  const url = new URL(`https://nominatim.openstreetmap.org/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RideX-student-portfolio/1.0 (local demo)',
    },
    signal: AbortSignal.timeout(7_000),
  });
  if (!response.ok) {
    throw new Error(`nominatim-${response.status}`);
  }
  return (await response.json()) as NominatimHit | NominatimHit[];
}

export async function searchPlaces(query: string): Promise<GeoHit[]> {
  const rows = await nominatim('search', {
    q: query,
    format: 'jsonv2',
    limit: '6',
    addressdetails: '0',
  });
  return parseNominatim(Array.isArray(rows) ? rows : [rows]);
}

export async function reversePlace(lat: number, lng: number): Promise<GeoHit> {
  const row = await nominatim('reverse', {
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
  });
  const parsed = parseNominatim([row as NominatimHit])[0];
  return parsed ?? { label: 'Current location', lat, lng };
}
