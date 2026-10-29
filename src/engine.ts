import { Radar, angleDiff, bearingDeg, distanceM } from './geo';

export type Fix = {
  lat: number;
  lon: number;
  /** rumo em graus (0-360); negativo/NaN = desconhecido */
  heading: number;
  /** velocidade em m/s */
  speedMps: number;
};

export type Ahead = { radar: Radar; dist: number };

export type AlertEvent = {
  radar: Radar;
  dist: number;
  kind: 'approach' | 'close' | 'overspeed';
  text: string;
};

// Parâmetros ajustáveis
export const CONFIG = {
  minSpeedMps: 3, // abaixo disso (~11 km/h) o rumo do GPS não é confiável
  coneDeg: 30, // radar precisa estar dentro de ±30° do rumo
  maxLateralM: 35, // descarta radares do outro lado do canteiro/pista oposta
  leadSeconds: 20, // aviso com ~20 s de antecedência
  minAlertDistM: 300,
  maxAlertDistM: 900,
  closeDistM: 120, // segundo aviso curto
  directionTolDeg: 60, // se o radar tem sentido conhecido, o rumo precisa bater
  overspeedMarginKmh: 5,
};

export function alertDistance(speedMps: number): number {
  return Math.min(
    CONFIG.maxAlertDistM,
    Math.max(CONFIG.minAlertDistM, speedMps * CONFIG.leadSeconds),
  );
}

/** Radares à frente na direção de deslocamento, do mais próximo ao mais distante. */
export function findAhead(radars: Radar[], fix: Fix): Ahead[] {
  if (!(fix.heading >= 0) || fix.speedMps < CONFIG.minSpeedMps) return [];
  const maxDist = alertDistance(fix.speedMps);
  // pré-filtro barato por caixa (1° de latitude ≈ 111 km)
  const dLat = maxDist / 111000;
  const dLon = maxDist / (111000 * Math.max(0.2, Math.cos((fix.lat * Math.PI) / 180)));
  const out: Ahead[] = [];
  for (const r of radars) {
    if (Math.abs(r.lat - fix.lat) > dLat || Math.abs(r.lon - fix.lon) > dLon) continue;
    const dist = distanceM(fix.lat, fix.lon, r.lat, r.lon);
    if (dist > maxDist) continue;
    const brg = bearingDeg(fix.lat, fix.lon, r.lat, r.lon);
    const diff = angleDiff(brg, fix.heading);
    if (diff > CONFIG.coneDeg) continue;
    if (dist * Math.sin((diff * Math.PI) / 180) > CONFIG.maxLateralM) continue;
    if (
      r.direction !== undefined &&
      angleDiff(r.direction, fix.heading) > CONFIG.directionTolDeg
    ) {
      continue;
    }
    out.push({ radar: r, dist });
  }
  return out.sort((a, b) => a.dist - b.dist);
}

function roundDist(m: number): number {
  return m >= 500 ? Math.round(m / 100) * 100 : Math.round(m / 50) * 50;
}

/**
 * Mantém o estado dos avisos já dados, para não repetir a fala a cada leitura do GPS.
 * Cada radar tem até 2 avisos por passagem: "approach" (distante) e "close" (perto).
 */
export class AlertEngine {
  private stage = new Map<string, 0 | 1 | 2>();
  private overspeedAt = 0;

  reset() {
    this.stage.clear();
    this.overspeedAt = 0;
  }

  update(radars: Radar[], fix: Fix, now = Date.now()): { ahead: Ahead[]; events: AlertEvent[] } {
    const ahead = findAhead(radars, fix);
    const events: AlertEvent[] = [];
    const inView = new Set(ahead.map((a) => a.radar.id));

    // esquece radares que já passaram ou saíram do campo de visão
    for (const id of Array.from(this.stage.keys())) {
      if (!inView.has(id)) this.stage.delete(id);
    }

    const speedKmh = fix.speedMps * 3.6;
    for (const { radar, dist } of ahead) {
      const s = this.stage.get(radar.id) ?? 0;
      const limit = radar.maxspeed ? `, limite ${radar.maxspeed}` : '';

      if (dist <= CONFIG.closeDistM && s < 2) {
        this.stage.set(radar.id, 2);
        events.push({ radar, dist, kind: 'close', text: 'Radar' });
      } else if (s < 1) {
        this.stage.set(radar.id, 1);
        events.push({
          radar,
          dist,
          kind: 'approach',
          text: `Radar à frente, ${roundDist(dist)} metros${limit}`,
        });
      }

      if (
        radar.maxspeed &&
        speedKmh > radar.maxspeed + CONFIG.overspeedMarginKmh &&
        now - this.overspeedAt > 8000 &&
        dist <= alertDistance(fix.speedMps)
      ) {
        this.overspeedAt = now;
        events.push({ radar, dist, kind: 'overspeed', text: 'Reduza a velocidade' });
      }
    }
    return { ahead, events };
  }
}
