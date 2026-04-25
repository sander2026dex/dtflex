// ============================================================================
// DUAL-MODE HALFTONE ENGINE — Vanilla Canvas, no external libs
// ----------------------------------------------------------------------------
//   🟠 ROSETTE CMYK  → 4 channels (C/M/Y/K) on 4 angled grids → real rosettes
//   🔵 ROUND CLEAN   → 1 RGB grid, single user angle, organic colored aura
//
// Rendering strategy (spec-compliant):
//   for (y = 0; y < h; y += cellSize)
//     for (x = 0; x < w; x += cellSize)
//       sample cell center → compute radius → ctx.arc().fill()
//
// Output: PNG-32 (RGBA) · 3307×4930 px · 300 DPI (pHYs metadata embedded).
// ============================================================================

export type ProgressFn = (stage: string, pct: number) => void;
export type HalftoneMode = "rosette_cmyk" | "round_clean";

// ---------------------------------------------------------------------------
// PNG DPI metadata injection (pHYs chunk → 300 DPI)
// ---------------------------------------------------------------------------
function crc32(buf: Uint8Array): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function injectDpiPng(blob: Blob, dpi = 300): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi * 39.3701);
  const phys = new Uint8Array(21);
  phys[0] = 0; phys[1] = 0; phys[2] = 0; phys[3] = 9;
  phys[4] = 0x70; phys[5] = 0x48; phys[6] = 0x59; phys[7] = 0x73;
  const dv = new DataView(phys.buffer);
  dv.setUint32(8, ppm); dv.setUint32(12, ppm);
  phys[16] = 1;
  const crcInput = phys.slice(4, 17);
  dv.setUint32(17, crc32(crcInput));
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;
  const out = new Uint8Array(buf.length + phys.length);
  out.set(buf.subarray(0, ihdrEnd), 0);
  out.set(phys, ihdrEnd);
  out.set(buf.subarray(ihdrEnd), ihdrEnd + phys.length);
  return new Blob([out], { type: "image/png" });
}

// ---------------------------------------------------------------------------
// Canvas helpers (uses OffscreenCanvas where available)
// ---------------------------------------------------------------------------
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function ctx2d(c: AnyCanvas): AnyCtx {
  return c.getContext("2d", { willReadFrequently: true }) as AnyCtx;
}

async function canvasToBlob(c: AnyCanvas): Promise<Blob> {
  if ("convertToBlob" in c) return await (c as OffscreenCanvas).convertToBlob({ type: "image/png" });
  return await new Promise<Blob>((res) => (c as HTMLCanvasElement).toBlob((b) => res(b!), "image/png"));
}

// ---------------------------------------------------------------------------
// Stepped high-quality resize
// ---------------------------------------------------------------------------
function resizeTo(src: HTMLImageElement | AnyCanvas, tw: number, th: number): AnyCanvas {
  const sw = "naturalWidth" in src ? (src as HTMLImageElement).naturalWidth : (src as AnyCanvas).width;
  const sh = "naturalHeight" in src ? (src as HTMLImageElement).naturalHeight : (src as AnyCanvas).height;
  let stage: AnyCanvas;
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) {
    stage = makeCanvas(sw, sh);
    ctx2d(stage).drawImage(src, 0, 0);
  } else {
    stage = src as AnyCanvas;
  }
  while (stage.width * 0.5 > tw * 1.4 && stage.height * 0.5 > th * 1.4) {
    const next = makeCanvas(Math.round(stage.width * 0.5), Math.round(stage.height * 0.5));
    const c = ctx2d(next);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(stage as CanvasImageSource, 0, 0, next.width, next.height);
    stage = next;
  }
  if (stage.width === tw && stage.height === th) return stage;
  const out = makeCanvas(tw, th);
  const c = ctx2d(out);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  c.drawImage(stage as CanvasImageSource, 0, 0, tw, th);
  return out;
}

// ---------------------------------------------------------------------------
// Pixel ops
// ---------------------------------------------------------------------------
function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 0.999) return [0, 0, 0, 1];
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return [c, m, y, k];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Per-channel pre-processing curve (PRINT SPEC):
//   shadows < 10%   → clamp to 0       (rich anchor blacks)
//   highlights > 90% → clamp to 0.90   (so highlights still print as dots)
//   midtones        → linear contrast (slope 1.5 around 0.5)
function heavyInkCurve(v: number): number {
  if (v < 0.10) return 0;
  if (v > 0.90) return 0.90;
  return clamp01(0.5 + (v - 0.5) * 1.5);
}

function preprocessHeavyInk(img: ImageData): ImageData {
  const { width, height, data } = img;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = heavyInkCurve(d[i] / 255);
    let g = heavyInkCurve(d[i + 1] / 255);
    let b = heavyInkCurve(d[i + 2] / 255);

    // Saturation +30% around perceptual luma.
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    r = clamp01(l + (r - l) * 1.3);
    g = clamp01(l + (g - l) * 1.3);
    b = clamp01(l + (b - l) * 1.3);

    d[i] = Math.round(r * 255);
    d[i + 1] = Math.round(g * 255);
    d[i + 2] = Math.round(b * 255);
  }
  return out;
}

function rosetteInkCurve(v: number): number {
  if (v < 0.10) return 0;
  if (v > 0.985) return 1;
  if (v > 0.90) return 0.96 + ((v - 0.90) / 0.085) * 0.04;
  return clamp01(0.5 + (v - 0.5) * 1.35);
}

function preprocessRosetteCmyk(img: ImageData): ImageData {
  const { width, height, data } = img;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = rosetteInkCurve(d[i] / 255);
    let g = rosetteInkCurve(d[i + 1] / 255);
    let b = rosetteInkCurve(d[i + 2] / 255);

    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    r = clamp01(l + (r - l) * 1.3);
    g = clamp01(l + (g - l) * 1.3);
    b = clamp01(l + (b - l) * 1.3);

    d[i] = Math.round(r * 255);
    d[i + 1] = Math.round(g * 255);
    d[i + 2] = Math.round(b * 255);
  }
  return out;
}

function luma255(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

// ---------------------------------------------------------------------------
// Value-noise (fBm) for ROUND aura splatter
// ---------------------------------------------------------------------------
function makeValueNoise(seed = 1337) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 10000) / 10000;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise2d = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const v00 = hash(xi, yi);
    const v10 = hash(xi + 1, yi);
    const v01 = hash(xi, yi + 1);
    const v11 = hash(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return v00 * (1 - u) * (1 - v) + v10 * u * (1 - v) + v01 * (1 - u) * v + v11 * u * v;
  };
  return (x: number, y: number, octaves = 4, lacunarity = 2.1, gain = 0.55) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2d(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}

// ---------------------------------------------------------------------------
// Subject mask via flood-fill from the 4 corners (ROUND aura)
// ---------------------------------------------------------------------------
function subjectMaskFromCorners(img: ImageData, tolerance = 32): Uint8Array {
  const { width: w, height: h, data } = img;
  const total = w * h;
  const isBg = new Uint8Array(total);
  const corners: [number, number][] = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  const seedRGB: [number, number, number][] = [];
  const stack: number[] = [];
  for (const [cx, cy] of corners) {
    const idx = cy * w + cx;
    const di = idx * 4;
    seedRGB.push([data[di], data[di + 1], data[di + 2]]);
    if (!isBg[idx]) { isBg[idx] = 1; stack.push(idx); }
  }
  const matches = (idx: number) => {
    const di = idx * 4;
    const r = data[di], g = data[di + 1], b = data[di + 2];
    for (const [sr, sg, sb] of seedRGB) {
      if (Math.max(Math.abs(r - sr), Math.abs(g - sg), Math.abs(b - sb)) <= tolerance) return true;
    }
    return false;
  };
  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0 && !isBg[idx - 1] && matches(idx - 1)) { isBg[idx - 1] = 1; stack.push(idx - 1); }
    if (x < w - 1 && !isBg[idx + 1] && matches(idx + 1)) { isBg[idx + 1] = 1; stack.push(idx + 1); }
    if (y > 0 && !isBg[idx - w] && matches(idx - w)) { isBg[idx - w] = 1; stack.push(idx - w); }
    if (y < h - 1 && !isBg[idx + w] && matches(idx + w)) { isBg[idx + w] = 1; stack.push(idx + w); }
  }
  const subj = new Uint8Array(total);
  for (let i = 0; i < total; i++) subj[i] = isBg[i] ? 0 : 1;
  return subj;
}

// Morphological dilation (square structuring element radius=r) — irregularizes
// the boundary slightly when combined with noise gating.
function dilate(subj: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return subj.slice();
  const out = new Uint8Array(subj.length);
  // horizontal pass
  const tmp = new Uint8Array(subj.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        if (subj[y * w + xx]) { v = 1; break; }
      }
      tmp[y * w + x] = v;
    }
  }
  // vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        if (tmp[yy * w + x]) { v = 1; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// Chamfer 3-4 distance transform (px) FROM subject edge, OUTWARD; also returns
// nearest-subject coordinates so the aura can sample subject color.
function distanceFromSubjectWithNearest(
  subj: Uint8Array,
  w: number,
  h: number,
): { dist: Float32Array; nx: Int32Array; ny: Int32Array } {
  const total = w * h;
  const INF = 1e9;
  const d = new Float32Array(total);
  const nx = new Int32Array(total);
  const ny = new Int32Array(total);
  for (let i = 0; i < total; i++) {
    if (subj[i]) {
      d[i] = 0;
      const x = i % w;
      const y = (i - x) / w;
      nx[i] = x; ny[i] = y;
    } else {
      d[i] = INF;
      nx[i] = -1; ny[i] = -1;
    }
  }
  const relax = (i: number, j: number, cost: number) => {
    if (d[j] + cost < d[i]) {
      d[i] = d[j] + cost;
      nx[i] = nx[j]; ny[i] = ny[j];
    }
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x > 0) relax(i, i - 1, 3);
      if (y > 0) relax(i, i - w, 3);
      if (x > 0 && y > 0) relax(i, i - w - 1, 4);
      if (x < w - 1 && y > 0) relax(i, i - w + 1, 4);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x < w - 1) relax(i, i + 1, 3);
      if (y < h - 1) relax(i, i + w, 3);
      if (x < w - 1 && y < h - 1) relax(i, i + w + 1, 4);
      if (x > 0 && y < h - 1) relax(i, i + w - 1, 4);
    }
  }
  for (let i = 0; i < total; i++) d[i] /= 3; // approx pixels
  return { dist: d, nx, ny };
}

// ============================================================================
// 🟠 ENGINE 1 — ROSETTE CMYK
// ----------------------------------------------------------------------------
// MATH:
//   cellSize = dpi / lpi
//   For each ink, iterate its OWN rotated grid in steps of cellSize. At each
//   grid intersection, sample TRUE CMYK channel coverage at that point, then
//   draw one disc of radius:
//       r = (Channel_Value / 255) * Max_Radius
//   Low CMYK values in whites/highlights produce tiny/no dots — no dirty mesh.
//
//   Angle offsets (degrees): Cyan +15, Magenta +75, Yellow +0, Black +45.
// ============================================================================

interface RosetteScreen {
  ang: number;
  cos: number; sin: number;
  cellSize: number;
  ink: { r: number; g: number; b: number };
  channel: 0 | 1 | 2 | 3;
}

const INK = {
  C: { r: 0,   g: 174, b: 239 },
  M: { r: 236, g: 0,   b: 140 },
  Y: { r: 255, g: 237, b: 0   },
  K: { r: 18,  g: 18,  b: 18  },
};

// Backwards-compat helper used by aura code; kept linear so dot area tracks
// coverage without re-introducing the old "washed out" gamma.
function coverageHeavy(cov: number): number {
  return clamp01(cov);
}

export interface RosetteOpts {
  whiteBackground?: boolean;
}

async function renderRosette(
  src: ImageData,
  dpi: number,
  lpi: number,
  baseAngleDeg: number,
  whiteBackground: boolean,
  onProgress?: ProgressFn,
): Promise<AnyCanvas> {
  const { width: w, height: h, data } = src;
  const cellSize = dpi / lpi;

  // Final output canvas — STARTS FULLY TRANSPARENT (alpha = 0) for DTF.
  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  ctx.clearRect(0, 0, w, h);

  // Internal compositing canvas: CMYK multiply only works on white.
  // We composite all 4 ink layers onto white here, then knock white → transparent
  // when blitting back to the final transparent canvas.
  const work = makeCanvas(w, h);
  const wctx = ctx2d(work);
  wctx.fillStyle = "rgb(255, 255, 255)";
  wctx.fillRect(0, 0, w, h);

  // Spec-mandated FIXED angles (absolute): C=15°, M=75°, Y=0°, K=45°.
  void baseAngleDeg;
  const screens: RosetteScreen[] = [
    { ang: (15 * Math.PI) / 180, cos: 0, sin: 0, cellSize, ink: INK.C, channel: 0 },
    { ang: (75 * Math.PI) / 180, cos: 0, sin: 0, cellSize, ink: INK.M, channel: 1 },
    { ang: (0  * Math.PI) / 180, cos: 0, sin: 0, cellSize, ink: INK.Y, channel: 2 },
    { ang: (45 * Math.PI) / 180, cos: 0, sin: 0, cellSize, ink: INK.K, channel: 3 },
  ];
  for (const s of screens) { s.cos = Math.cos(s.ang); s.sin = Math.sin(s.ang); }

  const diag = Math.ceil(Math.sqrt(w * w + h * h)) + cellSize * 2;
  const half = Math.ceil(diag / 2);
  const cx = w / 2, cy = h / 2;

  // STRICT CMYK DOT SIZING: radius = Channel_Value * Max_Radius.
  // White/highlight CMYK coverage must stay tiny or zero to avoid gray mesh.
  const MAX_SIZE = cellSize * 0.50;
  const MIN_VISIBLE_DOT = 1.0;
  const PURE_WHITE_RGB = 252;
  const WHITE_CHANNEL_SKIP = 0.015;

  const sampleCmyk = (x: number, y: number): [number, number, number, number] | null => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= w || yi < 0 || yi >= h) return null;
    const di = (yi * w + xi) * 4;
    return rgbToCmyk(data[di], data[di + 1], data[di + 2]);
  };

  for (let si = 0; si < screens.length; si++) {
    const s = screens[si];
    onProgress?.(`Rosette ${["C", "M", "Y", "K"][s.channel]} · ${lpi} LPI`, 30 + si * 12);
    const layer = makeCanvas(w, h);
    const lctx = ctx2d(layer);
    lctx.clearRect(0, 0, w, h);
    lctx.fillStyle = `rgb(${s.ink.r}, ${s.ink.g}, ${s.ink.b})`;

    for (let gy = -half; gy <= half; gy += s.cellSize) {
      for (let gx = -half; gx <= half; gx += s.cellSize) {
        const px = cx + gx * s.cos - gy * s.sin;
        const py = cy + gx * s.sin + gy * s.cos;
        const cmyk = sampleCmyk(px, py);
        if (!cmyk) continue;
        const xi = Math.round(px), yi = Math.round(py);
        const di = (yi * w + xi) * 4;
        if (data[di] >= PURE_WHITE_RGB && data[di + 1] >= PURE_WHITE_RGB && data[di + 2] >= PURE_WHITE_RGB) continue;
        const inkCoverage = cmyk[s.channel]; // TRUE CMYK channel coverage, 0..1
        if (inkCoverage <= WHITE_CHANNEL_SKIP) continue;
        const r = inkCoverage * MAX_SIZE;
        if (r < MIN_VISIBLE_DOT) continue;
        lctx.beginPath();
        lctx.arc(px, py, r, 0, Math.PI * 2);
        lctx.fill();
      }
    }

    // Always multiply onto the white work canvas — produces correct CMYK overlap.
    wctx.globalCompositeOperation = "multiply";
    wctx.drawImage(layer as CanvasImageSource, 0, 0);
  }
  wctx.globalCompositeOperation = "source-over";

  // Blit work → final canvas. If transparent BG requested, convert near-white
  // pixels to alpha=0 so only the inked area survives (DTF "preto vazado").
  if (whiteBackground) {
    ctx.drawImage(work as CanvasImageSource, 0, 0);
  } else {
    const id = wctx.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      // distFromWhite = how far from pure white this pixel is (0..255).
      // Pure / near-white background → alpha 0 (fully transparent).
      const distFromWhite = 255 - Math.min(r, g, b);
      if (distFromWhite < 8) {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
      } else if (distFromWhite < 22) {
        // Soft anti-alias edge so dot rims aren't harsh.
        d[i + 3] = Math.round((distFromWhite - 8) * (255 / 14));
      }
      // else keep alpha 255 — real ink pixel.
    }
    ctx.putImageData(id, 0, 0);
  }
  return canvas;
}

// ============================================================================
// 🔵 ENGINE 2 — ROUND CLEAN
// ----------------------------------------------------------------------------
// MATH:
//   cellSize = dpi / lpi
//   Single rotated grid (user angle applied uniformly → ZERO rosettes).
//   At each grid intersection on the image:
//       luminance = (R + G + B) / 3 / 255
//       r = (1 − luminance) * (cellSize * 0.45), with minRadius = 1.5
//   Dot is filled with the SUBJECT color sampled at that point.
//
// AURA:
//   1) subject mask = (alpha-aware) flood-fill from 4 corners + tolerance
//   2) dilate mask + simplex/value noise threshold → irregular splatter edge
//   3) for grid points OUTSIDE mask, within auraRadiusPx (60px default):
//        d        = chamfer distance to nearest mask pixel
//        opacity  = max(0, 1 − d/auraRadius)^1.5
//        radius   = baseRadius * opacity * 0.8
//        color    = sampled from NEAREST subject pixel (inherits hue)
//   4) Beyond aura → fully transparent.
// ============================================================================
async function renderRoundClean(
  src: ImageData,
  dpi: number,
  lpi: number,
  angleDeg: number,
  auraRadiusPx: number,
  bgTolerance: number,
  seed: number,
  onProgress?: ProgressFn,
): Promise<AnyCanvas> {
  const { width: w, height: h, data } = src;
  const cellSize = dpi / lpi;

  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  ctx.clearRect(0, 0, w, h);

  // ----- Subject mask + irregular boundary --------------------------------
  onProgress?.("Mask · subject", 28);
  const subjRaw = subjectMaskFromCorners(src, bgTolerance);
  // Slight dilation widens the body so dots near the silhouette aren't cut.
  const subj = dilate(subjRaw, w, h, 1);
  onProgress?.("Mask · distance transform", 40);
  const { dist, nx, ny } = distanceFromSubjectWithNearest(subj, w, h);
  const noise = makeValueNoise(seed);

  // Single rotated grid — same angle for every dot.
  const ang = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const cx = w / 2, cy = h / 2;
  const diag = Math.ceil(Math.sqrt(w * w + h * h)) + cellSize * 2;
  const half = Math.ceil(diag / 2);

  // GOLDEN RULE: DotSize = (1 - Brightness) * (MAX_SIZE - MIN_SIZE) + MIN_SIZE
  //   Brightness 0 (black) → MAX dot · Brightness 1 (white) → MIN_SIZE (NOT 0)
  const MAX_SIZE = cellSize * 0.50;
  const MIN_SIZE = 1.5;

  const sampleRgb = (x: number, y: number): [number, number, number] | null => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= w || yi < 0 || yi >= h) return null;
    const di = (yi * w + xi) * 4;
    return [data[di], data[di + 1], data[di + 2]];
  };

  onProgress?.(`Round Clean · ${lpi} LPI · ${angleDeg}°`, 55);

  for (let gy = -half; gy <= half; gy += cellSize) {
    for (let gx = -half; gx <= half; gx += cellSize) {
      const px = cx + gx * cos - gy * sin;
      const py = cy + gx * sin + gy * cos;
      const xi = Math.round(px), yi = Math.round(py);
      if (xi < 0 || xi >= w || yi < 0 || yi >= h) continue;
      const p = yi * w + xi;
      const insideSubject = subj[p] === 1;

      if (insideSubject) {
        const rgb = sampleRgb(px, py)!;
        // ----- HIGHLIGHT PROTECTION (Pacino-style clean faces) -----
        // Skip pure white (RGB > 250) so light skin / paper stays crisp.
        if (rgb[0] > 250 && rgb[1] > 250 && rgb[2] > 250) continue;
        const brightness = luma255(rgb[0], rgb[1], rgb[2]) / 255;
        // Highlight band (>90% brightness) → minimum 1px structural dot.
        let radius: number;
        if (brightness > 0.90) {
          radius = 1.0;
        } else {
          // Linear Golden Rule. NEVER transparent inside subject (mid/shadow).
          radius = (1 - brightness) * (MAX_SIZE - MIN_SIZE) + MIN_SIZE;
        }
        ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // ----- AURA = HALFTONE DOTS (NOT blur, NOT gradient) ------------------
      // Spec rules:
      //   if d >= auraRadius → skip (pixel stays fully transparent, alpha 0)
      //   else:
      //     dotRadius = baseRadius * (1 - d/auraRadius)
      //     dotAlpha  = 1 - d/auraRadius
      //     dotColor  = nearest subject pixel color
      //   The grid is the SAME halftone grid as the subject — so the aura is
      //   literally individual ctx.arc() circles, scattered, fading.
      if (auraRadiusPx <= 0) continue;
      const d = dist[p];
      if (d >= auraRadiusPx) continue; // beyond aura → keep transparent

      const sx = nx[p], sy = ny[p];
      if (sx < 0) continue;
      const di = (sy * w + sx) * 4;
      const rS = data[di], gS = data[di + 1], bS = data[di + 2];
      const brightnessS = luma255(rS, gS, bS) / 255;
      const baseR = (1 - brightnessS) * (MAX_SIZE - MIN_SIZE) + MIN_SIZE;

      const fade = 1 - d / auraRadiusPx;          // 1 at edge → 0 at aura limit
      const radius = Math.max(0, baseR * fade);
      if (radius < 0.4) continue;                  // too tiny to render
      const alpha = Math.max(0, Math.min(1, fade));

      ctx.fillStyle = `rgba(${rS}, ${gS}, ${bS}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // noise generator was used in earlier iterations; intentionally unused now
  // to keep the aura as pure halftone dots per spec.
  void noise;
  return canvas;
}

// ============================================================================
// PIPELINE OPTIONS + PUBLIC API
// ============================================================================
export interface HalftoneOptions {
  mode?: HalftoneMode;
  targetW?: number;
  targetH?: number;
  dpi?: number;
  lpi?: number;
  baseAngleDeg?: number;
  auraRadiusPx?: number;
  bgTolerance?: number;
  seed?: number;
  whiteBackground?: boolean; // ROSETTE only — white vs transparent canvas
}

export const DEFAULT_OPTIONS: Required<HalftoneOptions> = {
  mode: "rosette_cmyk",
  targetW: 3307,
  targetH: 4930,
  dpi: 300,
  lpi: 35,
  baseAngleDeg: 45,
  auraRadiusPx: 60,
  bgTolerance: 38,
  seed: 1337,
  whiteBackground: false,
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function processImage(
  source: HTMLImageElement,
  opts: HalftoneOptions = {},
  onProgress?: ProgressFn,
  previewMaxDim?: number,
): Promise<Blob> {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  let tw = o.targetW, th = o.targetH;
  if (previewMaxDim) {
    const ratio = Math.min(previewMaxDim / tw, previewMaxDim / th);
    tw = Math.round(tw * ratio);
    th = Math.round(th * ratio);
  }
  const effectiveDpi = previewMaxDim ? (o.dpi * tw) / o.targetW : o.dpi;
  const effectiveAura = o.auraRadiusPx * (tw / o.targetW);

  onProgress?.("Resize", 8);
  await tick();
  const stage = resizeTo(source, tw, th);
  const sctx = ctx2d(stage);
  const rawData = sctx.getImageData(0, 0, tw, th);

  onProgress?.("Heavy Ink curves · contrast + saturation", 18);
  await tick();
  const data = preprocessHeavyInk(rawData);

  let outCanvas: AnyCanvas;
  if (o.mode === "rosette_cmyk") {
    outCanvas = await renderRosette(data, effectiveDpi, o.lpi, o.baseAngleDeg, o.whiteBackground, onProgress);
  } else {
    outCanvas = await renderRoundClean(
      data,
      effectiveDpi,
      o.lpi,
      o.baseAngleDeg,
      effectiveAura,
      o.bgTolerance,
      o.seed,
      onProgress,
    );
  }

  onProgress?.("Encoding PNG-32", 92);
  await tick();
  const blob = await canvasToBlob(outCanvas);

  onProgress?.("Embedding 300 DPI metadata", 98);
  const finalBlob = await injectDpiPng(blob, o.dpi);
  onProgress?.("Done", 100);
  return finalBlob;
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = (e) => rej(e);
    img.src = url;
  });
}
