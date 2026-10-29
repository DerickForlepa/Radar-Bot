import { angleDiff, bearingDeg, distanceM } from '../geo';

describe('distanceM', () => {
  it('é zero para o mesmo ponto', () => {
    expect(distanceM(-23.55, -46.63, -23.55, -46.63)).toBe(0);
  });

  it('1° de latitude ≈ 111 km', () => {
    expect(distanceM(0, 0, 1, 0)).toBeCloseTo(111195, -2);
  });

  it('é simétrica', () => {
    const a = distanceM(-23.55, -46.63, -22.9, -43.2);
    const b = distanceM(-22.9, -43.2, -23.55, -46.63);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('bearingDeg', () => {
  it('norte, leste, sul e oeste', () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 5);
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 5);
    expect(bearingDeg(0, 0, -1, 0)).toBeCloseTo(180, 5);
    expect(bearingDeg(0, 0, 0, -1)).toBeCloseTo(270, 5);
  });
});

describe('angleDiff', () => {
  it('passa pela virada 359° → 1°', () => {
    expect(angleDiff(359, 1)).toBe(2);
    expect(angleDiff(1, 359)).toBe(2);
  });

  it('máximo é 180°', () => {
    expect(angleDiff(0, 180)).toBe(180);
    expect(angleDiff(90, 300)).toBe(150);
  });

  it('é zero para rumos iguais', () => {
    expect(angleDiff(45, 45)).toBe(0);
  });
});
