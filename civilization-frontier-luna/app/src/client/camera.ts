/** Cámara 2D con zoom hacia el cursor y paneo con arrastre. */
export const TILE = 8; // píxeles de mundo por tile

export class Camera {
  x = 0; // esquina superior izquierda en píxeles de mundo
  y = 0;
  scale = 1.6;
  minScale = 0.6;
  maxScale = 8;

  constructor(
    private worldW: number,
    private worldH: number,
  ) {}

  fit(viewW: number, viewH: number): void {
    this.scale = Math.max(viewW / this.worldW, viewH / this.worldH);
    this.minScale = this.scale * 0.85;
    this.x = (this.worldW - viewW / this.scale) / 2;
    this.y = (this.worldH - viewH / this.scale) / 2;
    this.clamp(viewW, viewH);
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.x + sx / this.scale, this.y + sy / this.scale];
  }

  zoomAt(sx: number, sy: number, factor: number, viewW: number, viewH: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.x = wx - sx / this.scale;
    this.y = wy - sy / this.scale;
    this.clamp(viewW, viewH);
  }

  pan(dxScreen: number, dyScreen: number, viewW: number, viewH: number): void {
    this.x -= dxScreen / this.scale;
    this.y -= dyScreen / this.scale;
    this.clamp(viewW, viewH);
  }

  clamp(viewW: number, viewH: number): void {
    const vw = viewW / this.scale;
    const vh = viewH / this.scale;
    const margin = 40;
    this.x = Math.min(this.worldW - vw + margin, Math.max(-margin, this.x));
    this.y = Math.min(this.worldH - vh + margin, Math.max(-margin, this.y));
    if (vw > this.worldW + margin * 2) this.x = (this.worldW - vw) / 2;
    if (vh > this.worldH + margin * 2) this.y = (this.worldH - vh) / 2;
  }
}
