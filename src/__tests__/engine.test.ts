import { AlertEngine, CONFIG, Fix, alertDistance, findAhead } from '../engine';
import { Radar } from '../geo';

// 1 m de latitude ≈ 1/111195 grau
const M = 1 / 111195;
const ORIGIN = { lat: -23.5, lon: -46.6 };

/** Radar `north` metros ao norte e `east` metros a leste da origem. */
function radarAt(north: number, east = 0, extra: Partial<Radar> = {}): Radar {
  return {
    id: `r-${north}-${east}`,
    lat: ORIGIN.lat + north * M,
    lon: ORIGIN.lon + (east * M) / Math.cos((ORIGIN.lat * Math.PI) / 180),
    source: 'user',
    ...extra,
  };
}

/** Indo para o norte a 20 m/s (72 km/h) a partir da origem. */
const fix = (extra: Partial<Fix> = {}): Fix => ({
  ...ORIGIN,
  heading: 0,
  speedMps: 20,
  ...extra,
});

describe('alertDistance', () => {
  it('respeita o mínimo e o máximo', () => {
    expect(alertDistance(3)).toBe(CONFIG.minAlertDistM);
    expect(alertDistance(20)).toBe(400);
    expect(alertDistance(100)).toBe(CONFIG.maxAlertDistM);
  });
});

describe('findAhead', () => {
  it('encontra radar à frente', () => {
    const res = findAhead([radarAt(300)], fix());
    expect(res).toHaveLength(1);
    expect(res[0].dist).toBeCloseTo(300, 0);
  });

  it('ignora radar atrás', () => {
    expect(findAhead([radarAt(-200)], fix())).toHaveLength(0);
  });

  it('ignora radar além da distância de aviso', () => {
    expect(findAhead([radarAt(600)], fix())).toHaveLength(0);
  });

  it('ignora radar fora do cone', () => {
    expect(findAhead([radarAt(100, 100)], fix())).toHaveLength(0);
  });

  it('ignora radar da pista oposta (lateral > 35 m)', () => {
    expect(findAhead([radarAt(300, 50)], fix())).toHaveLength(0);
  });

  it('aceita radar com leve desvio lateral', () => {
    expect(findAhead([radarAt(300, 10)], fix())).toHaveLength(1);
  });

  it('ignora radar com sentido contrário ao rumo', () => {
    expect(findAhead([radarAt(300, 0, { direction: 180 })], fix())).toHaveLength(0);
  });

  it('aceita radar com sentido igual ao rumo', () => {
    expect(findAhead([radarAt(300, 0, { direction: 10 })], fix())).toHaveLength(1);
  });

  it('não alerta devagar demais ou sem rumo', () => {
    expect(findAhead([radarAt(100)], fix({ speedMps: 1 }))).toHaveLength(0);
    expect(findAhead([radarAt(100)], fix({ heading: -1 }))).toHaveLength(0);
  });

  it('ordena do mais próximo ao mais distante', () => {
    const res = findAhead([radarAt(350), radarAt(100)], fix());
    expect(res.map((r) => Math.round(r.dist))).toEqual([100, 350]);
  });
});

describe('AlertEngine', () => {
  it('avisa "approach" uma única vez por radar', () => {
    const e = new AlertEngine();
    const r = [radarAt(350, 0, { maxspeed: 80 })];
    const first = e.update(r, fix());
    expect(first.events).toHaveLength(1);
    expect(first.events[0].kind).toBe('approach');
    expect(first.events[0].text).toBe('Radar à frente, 350 metros, limite 80');
    expect(e.update(r, fix({ lat: ORIGIN.lat + 10 * M })).events).toHaveLength(0);
  });

  it('avisa "close" ao chegar perto, uma vez', () => {
    const e = new AlertEngine();
    const r = [radarAt(350)];
    e.update(r, fix());
    const near = e.update(r, fix({ lat: ORIGIN.lat + 250 * M }));
    expect(near.events.map((x) => x.kind)).toEqual(['close']);
    expect(near.events[0].text).toBe('Radar');
    expect(e.update(r, fix({ lat: ORIGIN.lat + 260 * M })).events).toHaveLength(0);
  });

  it('pula direto para "close" se o primeiro contato já é perto', () => {
    const e = new AlertEngine();
    const res = e.update([radarAt(100)], fix());
    expect(res.events.map((x) => x.kind)).toEqual(['close']);
  });

  it('avisa de novo depois que o radar sai do campo de visão', () => {
    const e = new AlertEngine();
    const r = [radarAt(350)];
    e.update(r, fix());
    e.update([], fix());
    expect(e.update(r, fix()).events).toHaveLength(1);
  });

  it('avisa excesso de velocidade, com intervalo de 8 s', () => {
    const e = new AlertEngine();
    const r = [radarAt(350, 0, { maxspeed: 50 })]; // 72 km/h > 55
    const t0 = 1_000_000;
    const first = e.update(r, fix(), t0);
    expect(first.events.map((x) => x.kind)).toEqual(['approach', 'overspeed']);
    expect(e.update(r, fix(), t0 + 3000).events).toHaveLength(0);
    expect(e.update(r, fix(), t0 + 9000).events.map((x) => x.kind)).toEqual(['overspeed']);
  });

  it('não avisa excesso dentro da margem', () => {
    const e = new AlertEngine();
    const r = [radarAt(350, 0, { maxspeed: 70 })]; // 72 km/h ≤ 75
    expect(e.update(r, fix()).events.map((x) => x.kind)).toEqual(['approach']);
  });

  it('reset limpa o estado', () => {
    const e = new AlertEngine();
    const r = [radarAt(350)];
    e.update(r, fix());
    e.reset();
    expect(e.update(r, fix()).events).toHaveLength(1);
  });
});
