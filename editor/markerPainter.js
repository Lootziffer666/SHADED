// MarkerPainter — the second small, stable facade in this editor: a brush tool that
// paints SHADED's "marker overlay" contract (CLAUDE.md: a scene copy where only the
// correction spots are painted over; auto-detected via palette coverage; unchanged
// pixels can never become markers). It never touches the running engine — it only
// produces a PNG the caller can hand to `SceneEditorFacade.loadMaterialFile()`.
//
// `MARKER_BRUSH.hex` and `CANONICAL_PALETTE` are hand-kept in sync with index.html's
// own `PALETTE` object and its hardcoded pink-marker threshold
// (`r>150 && g<140 && (r-g)>55 && (b-g)>20`) — index.html stays the source of truth;
// this file must never introduce a second, independent classification (CLAUDE.md
// Invariante 2).

export const MARKER_BRUSH = { id: 'marker-window', label: 'Fenster-Marker', hex: '#FF33CC' };

export const CANONICAL_PALETTE = [
  { id: 'grass', label: 'Gras', hex: '#16A34A' },
  { id: 'foliage', label: 'Laub', hex: '#AA0EB7' },
  { id: 'roof', label: 'Dach', hex: '#F97316' },
  { id: 'path', label: 'Weg', hex: '#DC2626' },
  { id: 'wood', label: 'Holz', hex: '#854D0E' },
  { id: 'window', label: 'Fenster (Klasse)', hex: '#0F766E' },
  { id: 'water', label: 'Wasser', hex: '#06B6D4' },
  { id: 'rock', label: 'Fels', hex: '#475569' },
];

export class MarkerPainter {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d', { willReadFrequently: true });
    this.brushColor = MARKER_BRUSH.hex;
    this.brushRadius = 12;
    this.baseImageData = null;
    this._painting = false;
    this._paintedAny = false;
    this._bindPointerEvents();
  }

  async loadImage(fileOrUrl) {
    const isBlob = fileOrUrl instanceof Blob;
    const src = isBlob ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
      img.src = src;
    });
    if (isBlob) URL.revokeObjectURL(src);

    this.canvas.width = img.width;
    this.canvas.height = img.height;
    this.ctx.drawImage(img, 0, 0);
    this.baseImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this._paintedAny = false;
  }

  setBrush(hex, radius) {
    if (hex) this.brushColor = hex;
    if (radius) this.brushRadius = radius;
  }

  paintAt(x, y) {
    if (!this.baseImageData) return;
    this.ctx.fillStyle = this.brushColor;
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.brushRadius, 0, Math.PI * 2);
    this.ctx.fill();
    this._paintedAny = true;
  }

  /** Restores the untouched original — every "marker" pixel goes back to being non-marker. */
  clearToOriginal() {
    if (this.baseImageData) this.ctx.putImageData(this.baseImageData, 0, 0);
    this._paintedAny = false;
  }

  hasPaintedAnything() {
    return this._paintedAny;
  }

  /** Number of pixels that differ from the loaded original — same diff SHADED's own marker-mode detection relies on. */
  countChangedPixels() {
    if (!this.baseImageData) return 0;
    const current = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    const base = this.baseImageData.data;
    let changed = 0;
    for (let i = 0; i < current.length; i += 4) {
      const dr = current[i] - base[i];
      const dg = current[i + 1] - base[i + 1];
      const db = current[i + 2] - base[i + 2];
      if (dr * dr + dg * dg + db * db > 3000) changed++; // same threshold as index.html's analyze()
    }
    return changed;
  }

  exportPNGBlob() {
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
  }

  _bindPointerEvents() {
    const toCanvasCoords = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this._painting = true;
      const { x, y } = toCanvasCoords(e);
      this.paintAt(x, y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this._painting) return;
      const { x, y } = toCanvasCoords(e);
      this.paintAt(x, y);
    });
    window.addEventListener('pointerup', () => {
      this._painting = false;
    });
  }
}
