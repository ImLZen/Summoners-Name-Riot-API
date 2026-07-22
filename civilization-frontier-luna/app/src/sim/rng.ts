/**
 * RNG determinista (mulberry32). Todo el azar de la simulación pasa por aquí
 * para que una misma semilla produzca exactamente la misma partida.
 *
 * El estado interno es un único uint32; la semilla inicial y el estado
 * serializado comparten representación, así que restaurar = crear.
 */
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  getState(): number;
}

export function createRng(seedOrState: number): Rng {
  let value = seedOrState >>> 0;
  const next = (): number => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    range: (min: number, max: number) => min + next() * (max - min),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    getState: () => value,
  };
}
