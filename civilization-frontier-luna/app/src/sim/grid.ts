/** Utilidades de grid compartidas por simulación y cliente. */

export function idx(x: number, y: number, cols: number): number {
  return y * cols + x;
}

export function xyOf(i: number, cols: number): [number, number] {
  return [i % cols, Math.floor(i / cols)];
}

export function distTiles(a: number, b: number, cols: number): number {
  const [ax, ay] = xyOf(a, cols);
  const [bx, by] = xyOf(b, cols);
  return Math.hypot(ax - bx, ay - by);
}

export function neighbors4(i: number, cols: number, rows: number): number[] {
  const x = i % cols;
  const y = Math.floor(i / cols);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < cols - 1) out.push(i + 1);
  if (y > 0) out.push(i - cols);
  if (y < rows - 1) out.push(i + cols);
  return out;
}

/** Itera los tiles dentro de un radio euclídeo alrededor de un tile centro. */
export function tilesInRadius(center: number, radius: number, cols: number, rows: number): number[] {
  const cx = center % cols;
  const cy = Math.floor(center / cols);
  const out: number[] = [];
  const r = Math.ceil(radius);
  for (let y = Math.max(0, cy - r); y <= Math.min(rows - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(cols - 1, cx + r); x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius) out.push(y * cols + x);
    }
  }
  return out;
}

/** Tiles atravesados por el segmento entre dos tiles (para sabotaje de aristas). */
export function tilesOnSegment(a: number, b: number, cols: number): number[] {
  const [ax, ay] = xyOf(a, cols);
  const [bx, by] = xyOf(b, cols);
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
  const out: number[] = [];
  let last = -1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    const i = idx(x, y, cols);
    if (i !== last) {
      out.push(i);
      last = i;
    }
  }
  return out;
}
