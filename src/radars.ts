import AsyncStorage from '@react-native-async-storage/async-storage';
import { Radar } from './geo';

const KEY_OSM = '@radar/osm';
const KEY_USER = '@radar/user';

let cache: { osm: Radar[]; user: Radar[]; all: Radar[] } | null = null;

function parseMaxspeed(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 && n < 200 ? n : undefined;
}

function parseDirection(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n)) return ((n % 360) + 360) % 360;
  const cardinal: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return cardinal[v.toUpperCase()];
}

async function load(): Promise<{ osm: Radar[]; user: Radar[]; all: Radar[] }> {
  if (cache) return cache;
  const [o, u] = await Promise.all([AsyncStorage.getItem(KEY_OSM), AsyncStorage.getItem(KEY_USER)]);
  const osm: Radar[] = o ? JSON.parse(o) : [];
  const user: Radar[] = u ? JSON.parse(u) : [];
  cache = { osm, user, all: [...osm, ...user] };
  return cache;
}

export async function getRadars(): Promise<Radar[]> {
  return (await load()).all;
}

export async function counts(): Promise<{ osm: number; user: number }> {
  const c = await load();
  return { osm: c.osm.length, user: c.user.length };
}

/**
 * Baixa radares do OpenStreetMap (Overpass API) num raio ao redor da posição.
 * Atenção: a cobertura de radares no Brasil no OSM é irregular — confira na prática.
 */
export async function downloadOsmRadars(lat: number, lon: number, radiusM = 30000): Promise<number> {
  const q = `[out:json][timeout:60];(node["highway"="speed_camera"](around:${radiusM},${lat},${lon});node["enforcement"="maxspeed"](around:${radiusM},${lat},${lon}););out body;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error(`Overpass respondeu ${res.status}`);
  const json = await res.json();
  const seen = new Set<string>();
  const osm: Radar[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== 'node') continue;
    const id = `osm-${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    osm.push({
      id,
      lat: el.lat,
      lon: el.lon,
      maxspeed: parseMaxspeed(el.tags?.maxspeed),
      direction: parseDirection(el.tags?.direction ?? el.tags?.['camera:direction']),
      source: 'osm',
    });
  }
  await AsyncStorage.setItem(KEY_OSM, JSON.stringify(osm));
  cache = null;
  return osm.length;
}

/** Marca um radar na posição atual. O sentido de fiscalização é o rumo em que você está indo. */
export async function addUserRadar(lat: number, lon: number, heading?: number, maxspeed?: number) {
  const c = await load();
  const radar: Radar = {
    id: `user-${Date.now()}`,
    lat,
    lon,
    maxspeed,
    direction: heading !== undefined && heading >= 0 ? heading : undefined,
    source: 'user',
  };
  const user = [...c.user, radar];
  await AsyncStorage.setItem(KEY_USER, JSON.stringify(user));
  cache = null;
  return radar;
}

export async function clearUserRadars() {
  await AsyncStorage.removeItem(KEY_USER);
  cache = null;
}
