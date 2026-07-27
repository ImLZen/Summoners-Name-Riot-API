/**
 * Generación determinista del mapa lunar (docs/11-lunar-map-and-world.md):
 * llanuras de mare, tierras altas, cráteres con borde y fondo, sombras
 * polares en la franja norte y corredores logísticos que cruzan la región.
 * Los depósitos siguen perfiles por terreno y se garantiza que cualquier
 * zona de spawn tenga minerales y hielo alcanzables.
 */
import type { Rng } from "./rng";
import type { Deposit, Terrain, Tile } from "./types";
import { idx, tilesInRadius, tilesOnSegment, xyOf } from "./grid";

interface ValueNoise {
  (x: number, y: number): number;
}

function makeValueNoise(rng: Rng, size: number): ValueNoise {
  const values = new Float64Array(size * size);
  for (let i = 0; i < values.length; i++) values[i] = rng.next();
  const at = (x: number, y: number) => values[((y % size) + size) % size * size + (((x % size) + size) % size)];
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v00 = at(x0, y0);
    const v10 = at(x0 + 1, y0);
    const v01 = at(x0, y0 + 1);
    const v11 = at(x0 + 1, y0 + 1);
    return v00 * (1 - sx) * (1 - sy) + v10 * sx * (1 - sy) + v01 * (1 - sx) * sy + v11 * sx * sy;
  };
}

export function generateMap(rng: Rng, cols: number, rows: number): Tile[] {
  const noise = makeValueNoise(rng, 64);
  const detail = makeValueNoise(rng, 64);
  const terrain: Terrain[] = new Array(cols * rows);

  // Base: mare vs tierras altas mediante ruido de dos octavas.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n = noise(x * 0.055, y * 0.055) * 0.7 + detail(x * 0.16, y * 0.16) * 0.3;
      terrain[idx(x, y, cols)] = n > 0.56 ? "highland" : "mare";
    }
  }

  // Franja polar norte: sombras con borde irregular.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const edge = 3.5 + detail(x * 0.2, 7.3) * 4.5;
      if (y < edge) terrain[idx(x, y, cols)] = "polar_shadow";
    }
  }

  // Cráteres: anillos de tierras altas con fondo de cráter; los grandes
  // guardan sombra (hielo) en el fondo.
  const craterCount = 9 + rng.int(4);
  const craters: Array<{ cx: number; cy: number; r: number }> = [];
  for (let c = 0; c < craterCount; c++) {
    const r = 2.5 + rng.next() * 4.5;
    const cx = 6 + rng.int(cols - 12);
    const cy = 10 + rng.int(rows - 16);
    craters.push({ cx, cy, r });
    for (const t of tilesInRadius(idx(cx, cy, cols), r + 1.2, cols, rows)) {
      const [tx, ty] = xyOf(t, cols);
      const d = Math.hypot(tx - cx, ty - cy);
      if (d > r - 1.1 && d <= r + 1.2) terrain[t] = "highland";
      else if (d <= r - 1.1) terrain[t] = r > 5 && d < r * 0.45 ? "polar_shadow" : "crater";
    }
  }

  // Corredores logísticos: trazos anchos que conectan puntos de interés.
  const corridorCount = 3;
  for (let c = 0; c < corridorCount; c++) {
    const a = idx(4 + rng.int(cols - 8), 8 + rng.int(rows - 12), cols);
    const b = idx(4 + rng.int(cols - 8), 8 + rng.int(rows - 12), cols);
    for (const t of tilesOnSegment(a, b, cols)) {
      for (const w of tilesInRadius(t, 1.2, cols, rows)) {
        if (terrain[w] !== "polar_shadow") terrain[w] = "corridor";
      }
    }
  }

  // Depósitos por perfil de terreno.
  const deposit: Deposit[] = new Array(cols * rows).fill("none");
  for (let i = 0; i < cols * rows; i++) {
    const t = terrain[i];
    const roll = rng.next();
    if (t === "highland" && roll < 0.085) deposit[i] = "minerals";
    else if (t === "crater" && roll < 0.13) deposit[i] = "minerals";
    else if (t === "polar_shadow" && roll < 0.16) deposit[i] = "water_ice";
    else if (t === "crater" && roll >= 0.13 && roll < 0.17) deposit[i] = "water_ice";
    else if (t === "mare" && roll < 0.02) deposit[i] = "minerals";
  }

  // Garantía de viabilidad: sembrar cúmulos de minerales y hielo repartidos
  // para que ningún spawn quede sin ruta viable a recursos básicos.
  const cellW = Math.floor(cols / 4);
  const cellH = Math.floor(rows / 3);
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const seedCluster = (kind: Deposit, count: number) => {
        const cx = gx * cellW + 2 + rng.int(Math.max(1, cellW - 4));
        const cy = gy * cellH + 2 + rng.int(Math.max(1, cellH - 4));
        for (const t of tilesInRadius(idx(cx, cy, cols), 1.6, cols, rows)) {
          if (count-- <= 0) break;
          deposit[t] = kind;
          if (kind === "water_ice" && terrain[t] !== "polar_shadow") terrain[t] = "crater";
        }
      };
      seedCluster("minerals", 3 + rng.int(3));
      seedCluster("water_ice", 2 + rng.int(2));
    }
  }

  const tiles: Tile[] = new Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    tiles[i] = { terrain: terrain[i], deposit: deposit[i], owner: -1, structure: -1, contestedBy: -1 };
  }
  return tiles;
}
