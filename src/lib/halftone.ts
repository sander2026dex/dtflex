// ============================================================================
// DUAL-MODE HALFTONE ENGINE
// ----------------------------------------------------------------------------
// Two mathematically distinct rendering pipelines, selected by `mode`:
//
//   🟠 ROSETTE CMYK  → 4 channels (C/M/Y/K), 4 angle-offset grids → rosettes
//   🔵 ROUND CLEAN   → 1 RGB grid, single angle, organic edge aura
//
// Output: PNG-32 (RGBA) · 3307×4930 px · 300 DPI metadata embedded.
// Performance: OffscreenCanvas + TypedArrays; grid-step iteration for dots.
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
// Fast resize (high-quality bilinear via stepped halving + final draw)
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
function rgbToLuma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 0.999) return [0, 0, 0, 1];
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return [c, m, y, k];
}

// ---------------------------------------------------------------------------
// Value-noise (fBm) used by the ROUND aura splatter
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
// Subject mask via flood-fill from the 4 corners (used only by ROUND aura)
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

// Chamfer 3-4 distance transform (in pixels) FROM subject edge, OUTWARD
function distanceFromSubject(subj: Uint8Array, w: number, h: number): Float32Array {
  const total = w * h;
  const INF = 1e9;
  const d = new Float32Array(total);
  for (let i = 0; i < total; i++) d[i] = subj[i] ? 0 : INF;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 3);
      if (y > 0) m = Math.min(m, d[i - w] + 3);
      if (x > 0 && y > 0) m = Math.min(m, d[i - w - 1] + 4);
      if (x < w - 1 && y > 0) m = Math.min(m, d[i - w + 1] + 4);
      d[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + 3);
      if (y < h - 1) m = Math.min(m, d[i + w] + 3);
      if (x < w - 1 && y < h - 1) m = Math.min(m, d[i + w + 1] + 4);
      if (x > 0 && y < h - 1) m = Math.min(m, d[i + w - 1] + 4);
      d[i] = m;
    }
  }
  for (let i = 0; i < total; i++) d[i] /= 3;
  return d;
}

// ============================================================================
// 🟠 ENGINE 1 — ROSETTE CMYK
// ----------------------------------------------------------------------------
// Math: Each ink (C/M/Y/K) is screened on its OWN angled grid. The grid step
// is (dpi / lpi). Dot radius for a cell is sqrt(coverage * cellArea / π) where
// coverage = channel value (0..1) modulated by Dot Gain.
//
// To produce authentic offset-print rosettes, the four screens are rotated by
// fixed offsets relative to the user's Base Angle:
//
//     C = base + 15°   M = base + 75°   Y = base + 0°   K = base + 45°
//
// Compositing: subtractive — start from white and multiply each ink-color
// where its dot is solid. Result is opaque RGB on transparent background
// (cells with no ink stay alpha=0, so the canvas remains transparent).
// ============================================================================

const INK = {
  C: { r: 0,   g: 174, b: 239 },
  M: { r: 236, g: 0,   b: 140 },
  Y: { r: 255, g: 237, b: 0   },
  K: { r: 18,  g: 18,  b: 18  },
};

interface ScreenSpec {
  ang: number;       // radians (inverse rotation cached cos/sin)
  cosI: number;
  sinI: number;
  cellPx: number;
  cellArea: number;
}

function makeScreen(angleDeg: number, dpi: number, lpi: number): ScreenSpec {
  const cellPx = dpi / lpi;
  const ang = (angleDeg * Math.PI) / 180;
  return { ang, cosI: Math.cos(-ang), sinI: Math.sin(-ang), cellPx, cellArea: cellPx * cellPx };
}

// Returns 1 if pixel (x,y) lies inside the ink dot for the given channel grid.
function dotHit(x: number, y: number, coverage: number, s: ScreenSpec): boolean {
  if (coverage <= 0.005) return false;
  const xr = x * s.cosI - y * s.sinI;
  const yr = x * s.sinI + y * s.cosI;
  const cxr = (Math.floor(xr / s.cellPx) + 0.5) * s.cellPx;
  const cyr = (Math.floor(yr / s.cellPx) + 0.5) * s.cellPx;
  const dxr = xr - cxr;
  const dyr = yr - cyr;
  const r = Math.sqrt((Math.min(1, coverage) * s.cellArea) / Math.PI);
  return dxr * dxr + dyr * dyr <= r * r;
}

function renderRosette(
  img: ImageData,
  dpi: number,
  lpi: number,
  baseAngleDeg: number,
  dotGain: number, // -0.2 .. +0.2
): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  const o = out.data;

  const sC = makeScreen(baseAngleDeg + 15, dpi, lpi);
  const sM = makeScreen(baseAngleDeg + 75, dpi, lpi);
  const sY = makeScreen(baseAngleDeg + 0,  dpi, lpi);
  const sK = makeScreen(baseAngleDeg + 45, dpi, lpi);

  // Validation — distinct per-channel angles (mod 90°)
  const angs = [sC.ang, sM.ang, sY.ang, sK.ang].map((a) => Math.round(((a * 180) / Math.PI) % 90));
  if (new Set(angs).size < 4) {
    console.warn("[rosette] expected 4 distinct angles, got", angs);
  }

  const gain = 1 + dotGain; // multiplicative

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [c, m, yC, k] = rgbToCmyk(data[i], data[i + 1], data[i + 2]);
      const cc = Math.max(0, Math.min(1, c * gain));
      const mc = Math.max(0, Math.min(1, m * gain));
      const yc = Math.max(0, Math.min(1, yC * gain));
      const kc = Math.max(0, Math.min(1, k * gain));

      const hC = dotHit(x, y, cc, sC);
      const hM = dotHit(x, y, mc, sM);
      const hY = dotHit(x, y, yc, sY);
      const hK = dotHit(x, y, kc, sK);
      if (!hC && !hM && !hY && !hK) continue;

      // Subtractive mix from white
      let r = 1, g = 1, b = 1;
      if (hC) { r *= INK.C.r / 255; g *= INK.C.g / 255; b *= INK.C.b / 255; }
      if (hM) { r *= INK.M.r / 255; g *= INK.M.g / 255; b *= INK.M.b / 255; }
      if (hY) { r *= INK.Y.r / 255; g *= INK.Y.g / 255; b *= INK.Y.b / 255; }
      if (hK) { r *= INK.K.r / 255; g *= INK.K.g / 255; b *= INK.K.b / 255; }
      o[i]     = Math.round(r * 255);
      o[i + 1] = Math.round(g * 255);
      o[i + 2] = Math.round(b * 255);
      o[i + 3] = 255;
    }
  }
  return out;
}

// ============================================================================
// 🔵 ENGINE 2 — ROUND CLEAN
// ----------------------------------------------------------------------------
// Math: Single grid, single user angle (NO per-channel rotation → no rosettes).
// Dot radius is driven by luminance: dark = large, light = micro. There is a
// hard floor on dot size (1.2 px) so highlights never become transparent holes.
//
// Aura: outside the subject mask but within auraRadiusPx, dots fade in size
// and opacity exponentially with distance, jittered by fBm noise to make an
// organic splatter. Aura dot color is sampled from the nearest subject pixel
// (here we use the local pixel — flood-filled background colors are excluded).
// ============================================================================
function renderRoundClean(
  img: ImageData,
  dpi: number,
  lpi: number,
  angleDeg: number,
  dotGain: number,
  auraRadiusPx: number,
  bgTolerance: number,
  seed = 1337,
): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  const o = out.data;
  const screen = makeScreen(angleDeg, dpi, lpi);

  // Coverage range — never let highlights drop to zero
  const COVER_MIN = 0.04;
  const COVER_MAX = 0.98;
  const MIN_R_PX = 1.2;
  const gain = 1 + dotGain;

  // Subject mask only needed if aura is enabled
  const wantAura = auraRadiusPx > 0.5;
  let subj: Uint8Array | null = null;
  let dist: Float32Array | null = null;
  let noise: ((x: number, y: number, oct?: number, lac?: number, g?: number) => number) | null = null;
  if (wantAura) {
    subj = subjectMaskFromCorners(img, bgTolerance);
    dist = distanceFromSubject(subj, w, h);
    noise = makeValueNoise(seed);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      // Identical screen for ALL pixels — guarantees zero rosettes
      const xr = x * screen.cosI - y * screen.sinI;
      const yr = x * screen.sinI + y * screen.cosI;
      const cxr = (Math.floor(xr / screen.cellPx) + 0.5) * screen.cellPx;
      const cyr = (Math.floor(yr / screen.cellPx) + 0.5) * screen.cellPx;
      const dxr = xr - cxr;
      const dyr = yr - cyr;
      const distSq = dxr * dxr + dyr * dyr;

      const insideSubject = !wantAura || (subj && subj[p] === 1);

      if (insideSubject) {
        // Luma → coverage. Dark = large dot, light = micro dot (no holes).
        const luma = rgbToLuma(r, g, b) / 255;
        const density = (1 - luma) * gain;
        const coverage = COVER_MIN + (COVER_MAX - COVER_MIN) * Math.max(0, Math.min(1, density));
        let radius = Math.sqrt((coverage * screen.cellArea) / Math.PI);
        if (radius < MIN_R_PX) radius = MIN_R_PX;
        if (distSq > radius * radius) continue;
        const edgeT = distSq / (radius * radius);
        const aa = edgeT > 0.81 ? Math.max(0, 1 - (edgeT - 0.81) / 0.19) : 1;
        o[i] = r; o[i + 1] = g; o[i + 2] = b;
        o[i + 3] = Math.round(255 * aa);
        continue;
      }

      // ----- AURA region (outside subject) ---------------------------------
      if (!wantAura || !dist || !noise) continue;
      const dEdge = dist[p];
      if (dEdge > auraRadiusPx) continue;

      const t = dEdge / auraRadiusPx;          // 0 at edge → 1 at outer rim
      const falloff = Math.pow(1 - t, 1.8);    // exponential decay
      const n = noise(x * 0.012, y * 0.012, 4, 2.1, 0.55);
      // Splatter: the further from edge, the stronger the noise must be
      const noiseGate = 0.22 + t * 0.55;
      if (n < noiseGate) continue;

      const lumaP = rgbToLuma(r, g, b) / 255;
      const density = (1 - lumaP) * gain * (0.55 + 0.5 * n);
      const coverage = (COVER_MIN + (COVER_MAX - COVER_MIN) * density) * falloff;
      if (coverage <= 0.015) continue;
      let radius = Math.sqrt((coverage * screen.cellArea) / Math.PI);
      if (radius < 0.6) continue;              // no sub-pixel slivers in aura
      if (distSq > radius * radius) continue;

      // Sample color from the subject — for the aura we keep the actual local
      // pixel hue (already represents the subject silhouette since flood fill
      // removed the background).
      const edgeT = distSq / (radius * radius);
      const aa = edgeT > 0.81 ? Math.max(0, 1 - (edgeT - 0.81) / 0.19) : 1;
      const alpha = Math.round(255 * aa * Math.min(1, falloff * 1.4 + 0.05));
      if (alpha <= 4) continue;
      o[i] = r; o[i + 1] = g; o[i + 2] = b;
      o[i + 3] = alpha;
    }
  }
  return out;
}

// ============================================================================
// PIPELINE OPTIONS + PUBLIC API
// ============================================================================
export interface HalftoneOptions {
  mode?: HalftoneMode;     // "rosette_cmyk" | "round_clean"
  targetW?: number;
  targetH?: number;
  dpi?: number;
  lpi?: number;            // 20..150
  baseAngleDeg?: number;   // 0..90
  auraRadiusPx?: number;   // 0..80 — only in round_clean
  dotGain?: number;        // -0.2 .. +0.2
  bgTolerance?: number;    // for subject mask in round_clean
  seed?: number;
}

export const DEFAULT_OPTIONS: Required<HalftoneOptions> = {
  mode: "rosette_cmyk",
  targetW: 3307,
  targetH: 4930,
  dpi: 300,
  lpi: 55,                 // rosette default; UI swaps to 90 on round
  baseAngleDeg: 45,
  auraRadiusPx: 30,
  dotGain: 0,
  bgTolerance: 38,
  seed: 1337,
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
  const data = sctx.getImageData(0, 0, tw, th);

  // Validation rule for the user's spec
  if (o.mode === "rosette_cmyk") {
    onProgress?.(`🟠 Rosette CMYK · ${o.lpi} LPI · base ${o.baseAngleDeg}°`, 30);
  } else {
    onProgress?.(`🔵 Round Clean · ${o.lpi} LPI · ${o.baseAngleDeg}° · aura ${o.auraRadiusPx}px`, 30);
  }
  await tick();

  let halftone: ImageData;
  if (o.mode === "rosette_cmyk") {
    halftone = renderRosette(data, effectiveDpi, o.lpi, o.baseAngleDeg, o.dotGain);
  } else {
    halftone = renderRoundClean(
      data,
      effectiveDpi,
      o.lpi,
      o.baseAngleDeg,
      o.dotGain,
      effectiveAura,
      o.bgTolerance,
      o.seed,
    );
  }

  onProgress?.("Encoding PNG-32", 92);
  await tick();
  const outCanvas = makeCanvas(tw, th);
  const octx = ctx2d(outCanvas);
  octx.putImageData(halftone, 0, 0);
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
