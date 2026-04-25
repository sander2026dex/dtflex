// ============================================================================
// DTF HALFTONE ENGINE — strict physical printing rules.
// ----------------------------------------------------------------------------
//   MODE A · ROSETTE   → CMYK 4 telas, ângulos fixos C15 M75 Y0 K45
//   MODE B · CIRCULAR  → grade única, ângulo do usuário, com aura colorida
//   MODE C · HYBRID    → mistura A↔B controlada por "Rosette Intensity" (0..1)
//
// GOLDEN RULES (non-negotiable):
//   1. Background: ctx.clearRect — alpha 0 sempre.
//   2. Pure-black knockout: luminance < 5%  → alpha 0 (vazado).
//   3. White highlight protection: luminance > 95% → r=1.5px, opacity=40%.
//   4. Midtones (5%–95%): r = MIN + invertedLum * (MAX - MIN).
//
// Output: PNG-32 · 3307×4930 px · 300 DPI (pHYs).
// ============================================================================

export type ProgressFn = (stage: string, pct: number) => void;
export type HalftoneMode = "rosette_cmyk" | "round_clean" | "hybrid";

// ---------------------------------------------------------------------------
// PNG DPI metadata (pHYs chunk → 300 DPI)
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
// Canvas helpers
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
// Color helpers
// ---------------------------------------------------------------------------
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const luma01 = (r: number, g: number, b: number) =>
  (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;

function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 0.999) return [0, 0, 0, 1];
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return [c, m, y, k];
}

// Pre-press curve: anchors blacks, AGGRESSIVELY protects highlights so light
// colors (light yellow shirts, gray sneakers, off-white) don't get speckled.
// Light tones (>0.78) are pushed near-white so the highlight-skip logic can
// catch them and leave those areas clean.
function curve(v: number): number {
  if (v < 0.08) return 0;
  if (v > 0.78) {
    // Stretch [0.78..1] → [0.92..1] so all light values count as highlights.
    return clamp01(0.92 + (v - 0.78) * (0.08 / 0.22));
  }
  // Mild midtone contrast (1.15 instead of 1.4) — avoids crushing light colors.
  return clamp01(0.5 + (v - 0.5) * 1.15);
}
function preprocess(img: ImageData): ImageData {
  const { width, height, data } = img;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = curve(d[i] / 255);
    let g = curve(d[i + 1] / 255);
    let b = curve(d[i + 2] / 255);
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    // Light saturation boost ONLY in midtones; skip near-whites to keep clean.
    const satBoost = l > 0.85 ? 1.0 : 1.2;
    r = clamp01(l + (r - l) * satBoost);
    g = clamp01(l + (g - l) * satBoost);
    b = clamp01(l + (b - l) * satBoost);
    d[i] = Math.round(r * 255);
    d[i + 1] = Math.round(g * 255);
    d[i + 2] = Math.round(b * 255);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Subject mask (flood-fill from corners) + distance transform with nearest-px
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

// Erode: keeps only pixels where ALL neighbors within radius r are also "on".
// Used to find LARGE contiguous regions (small specks vanish).
function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) { v = 0; break; }
        if (!mask[y * w + xx]) { v = 0; break; }
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) { v = 0; break; }
        if (!tmp[yy * w + x]) { v = 0; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// Builds a "light area" mask: pixels that are LIGHT (high luminance, including
// light yellow / light gray / off-white — not just pure white) AND belong to a
// big contiguous light region. Small light specks inside the subject are NOT
// flagged, so detail is preserved. Used to skip halftone entirely in those
// areas → clean transparent ("vazado") whites/lights without speckled holes.
function largeWhiteMask(img: ImageData, erodeRadius = 6): Uint8Array {
  const { width: w, height: h, data } = img;
  const total = w * h;
  const light = new Uint8Array(total);
  for (let i = 0, di = 0; i < total; i++, di += 4) {
    const r = data[di], g = data[di + 1], b = data[di + 2];
    // LIGHT threshold: perceptual luminance > 0.82 catches light yellow shirts,
    // light blue jeans highlights, off-white sneakers, light gray, etc.
    const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    // Also require min channel > 180 so saturated mids (pure red/blue) survive.
    const minCh = Math.min(r, g, b);
    if (lum > 0.82 && minCh > 180) light[i] = 1;
  }
  // Erosion isolates only LARGE light regions (radius ~ small dot footprint).
  return erode(light, w, h, erodeRadius);
}

function dilate(subj: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return subj.slice();
  const tmp = new Uint8Array(subj.length);
  const out = new Uint8Array(subj.length);
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

function distanceFromSubjectWithNearest(
  subj: Uint8Array, w: number, h: number,
): { dist: Float32Array; nx: Int32Array; ny: Int32Array } {
  const total = w * h;
  const INF = 1e9;
  const d = new Float32Array(total);
  const nx = new Int32Array(total);
  const ny = new Int32Array(total);
  for (let i = 0; i < total; i++) {
    if (subj[i]) {
      d[i] = 0;
      const x = i % w; const y = (i - x) / w;
      nx[i] = x; ny[i] = y;
    } else { d[i] = INF; nx[i] = -1; ny[i] = -1; }
  }
  const relax = (i: number, j: number, cost: number) => {
    if (d[j] + cost < d[i]) { d[i] = d[j] + cost; nx[i] = nx[j]; ny[i] = ny[j]; }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (d[i] === 0) continue;
    if (x > 0) relax(i, i - 1, 3);
    if (y > 0) relax(i, i - w, 3);
    if (x > 0 && y > 0) relax(i, i - w - 1, 4);
    if (x < w - 1 && y > 0) relax(i, i - w + 1, 4);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (d[i] === 0) continue;
    if (x < w - 1) relax(i, i + 1, 3);
    if (y < h - 1) relax(i, i + w, 3);
    if (x < w - 1 && y < h - 1) relax(i, i + w + 1, 4);
    if (x > 0 && y < h - 1) relax(i, i + w - 1, 4);
  }
  for (let i = 0; i < total; i++) d[i] /= 3;
  return { dist: d, nx, ny };
}

// ============================================================================
// SHARED CONSTANTS — Golden Rules
// ============================================================================
const MIN_DOT_RADIUS = 1.5;          // physical print floor (~0.5 mm @300dpi)
const HIGHLIGHT_OPACITY = 0.40;      // white-protected dots: 40% opacity
const LUM_BLACK_KNOCKOUT = 0.05;     // <5% lum → vazado (no ink on dark fabric)
const LUM_WHITE_PROTECT = 0.85;      // >85% lum → skip dot (clean highlight)
const MIN_INK_COVERAGE = 0.12;       // <12% ink coverage per channel → skip
const DOT_GAIN_COMPENSATION = 0.88;  // -12% radius for rosette (bleed comp.)

// ============================================================================
// 🟠 ENGINE — ROSETTE CMYK
// At each ink's grid intersection, dot radius = channel coverage * MAX_RADIUS.
// Fixed angles C15 M75 Y0 K45. Knockout pure-black & background → alpha 0.
// ============================================================================
async function renderRosette(
  src: ImageData,
  dpi: number,
  lpi: number,
  onProgress: ((s: string, p: number) => void) | undefined,
  progressBase: number,
  progressSpan: number,
): Promise<AnyCanvas> {
  const { width: w, height: h, data } = src;
  const cellSize = dpi / lpi;

  // Detect LARGE white regions → skip halftone entirely (no "holes/speckles").
  const whiteMask = largeWhiteMask(src, Math.max(4, Math.round(cellSize * 0.6)));

  // FINAL canvas — fully transparent (Golden Rule #1).
  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  ctx.clearRect(0, 0, w, h);

  // CMYK multiply requires a white substrate; we knock it out at the end.
  const work = makeCanvas(w, h);
  const wctx = ctx2d(work);
  wctx.fillStyle = "rgb(255,255,255)";
  wctx.fillRect(0, 0, w, h);

  const INK = {
    C: { r: 0, g: 174, b: 239, ang: 15 },
    M: { r: 236, g: 0, b: 140, ang: 75 },
    Y: { r: 255, g: 237, b: 0, ang: 0 },
    K: { r: 18, g: 18, b: 18, ang: 45 },
  };
  const screens = [
    { ink: INK.C, channel: 0 as const },
    { ink: INK.M, channel: 1 as const },
    { ink: INK.Y, channel: 2 as const },
    { ink: INK.K, channel: 3 as const },
  ];

  const MAX_RADIUS = cellSize * 0.50 * DOT_GAIN_COMPENSATION;
  const diag = Math.ceil(Math.sqrt(w * w + h * h)) + cellSize * 2;
  const half = Math.ceil(diag / 2);
  const cx = w / 2, cy = h / 2;

  for (let si = 0; si < screens.length; si++) {
    const s = screens[si];
    onProgress?.(
      `Rosette ${["C", "M", "Y", "K"][s.channel]} · ${lpi} LPI`,
      Math.round(progressBase + (si / screens.length) * progressSpan),
    );
    const layer = makeCanvas(w, h);
    const lctx = ctx2d(layer);
    lctx.clearRect(0, 0, w, h);
    lctx.fillStyle = `rgb(${s.ink.r},${s.ink.g},${s.ink.b})`;

    const ang = (s.ink.ang * Math.PI) / 180;
    const cos = Math.cos(ang), sin = Math.sin(ang);

    for (let gy = -half; gy <= half; gy += cellSize) {
      for (let gx = -half; gx <= half; gx += cellSize) {
        const px = cx + gx * cos - gy * sin;
        const py = cy + gx * sin + gy * cos;
        const xi = Math.round(px), yi = Math.round(py);
        if (xi < 0 || xi >= w || yi < 0 || yi >= h) continue;

        // SKIP large white regions entirely → clean transparent areas.
        if (whiteMask[yi * w + xi]) continue;

        const di = (yi * w + xi) * 4;
        const R = data[di], G = data[di + 1], B = data[di + 2];
        const lum = luma01(R, G, B);

        // GOLDEN RULE #2 — pure black knockout (handled later via composite).
        if (lum < LUM_BLACK_KNOCKOUT) continue;

        // GOLDEN RULE #3 — highlight protection: skip dot in true highlights
        // (large white regions already skipped above; remaining highlights are
        // small/edge → leave clean instead of speckling).
        if (lum > LUM_WHITE_PROTECT) continue;

        // GOLDEN RULE #4 — midtone scaling by TRUE CMYK channel coverage.
        const cmyk = rgbToCmyk(R, G, B);
        const cov = cmyk[s.channel];
        // Skip channels with insufficient coverage → keeps light areas clean.
        if (cov < MIN_INK_COVERAGE) continue;
        const r = MIN_DOT_RADIUS + cov * (MAX_RADIUS - MIN_DOT_RADIUS);
        lctx.beginPath();
        lctx.arc(px, py, r, 0, Math.PI * 2);
        lctx.fill();
      }
    }
    wctx.globalCompositeOperation = "multiply";
    wctx.drawImage(layer as CanvasImageSource, 0, 0);
  }
  wctx.globalCompositeOperation = "source-over";

  // Knockout: near-white substrate → alpha 0 (background + white-protected
  // areas keep tiny K dots visible because those are gray, not white).
  const id = wctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const distFromWhite = 255 - Math.min(r, g, b);
    if (distFromWhite < 6) {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
    } else if (distFromWhite < 18) {
      d[i + 3] = Math.round((distFromWhite - 6) * (255 / 12));
    }
  }
  ctx.putImageData(id, 0, 0);
  return canvas;
}

// ============================================================================
// 🔵 ENGINE — CIRCULAR (single grid + colored aura)
// ============================================================================
async function renderCircular(
  src: ImageData,
  dpi: number,
  lpi: number,
  angleDeg: number,
  auraRadiusPx: number,
  bgTolerance: number,
  onProgress: ((s: string, p: number) => void) | undefined,
  progressBase: number,
  progressSpan: number,
): Promise<AnyCanvas> {
  const { width: w, height: h, data } = src;
  const cellSize = dpi / lpi;

  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  ctx.clearRect(0, 0, w, h);

  onProgress?.("Circular · subject mask", Math.round(progressBase + 0.1 * progressSpan));
  const subjRaw = subjectMaskFromCorners(src, bgTolerance);
  const subj = dilate(subjRaw, w, h, 1);
  // Detect LARGE white regions inside subject → skip halftone (no speckles).
  const whiteMask = largeWhiteMask(src, Math.max(4, Math.round(cellSize * 0.6)));
  onProgress?.("Circular · distance transform", Math.round(progressBase + 0.3 * progressSpan));
  const { dist, nx, ny } = distanceFromSubjectWithNearest(subj, w, h);

  const ang = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const cx = w / 2, cy = h / 2;
  const diag = Math.ceil(Math.sqrt(w * w + h * h)) + cellSize * 2;
  const half = Math.ceil(diag / 2);
  const MAX_RADIUS = cellSize * 0.50;

  onProgress?.(`Circular · ${lpi} LPI · ${angleDeg}°`, Math.round(progressBase + 0.5 * progressSpan));

  for (let gy = -half; gy <= half; gy += cellSize) {
    for (let gx = -half; gx <= half; gx += cellSize) {
      const px = cx + gx * cos - gy * sin;
      const py = cy + gx * sin + gy * cos;
      const xi = Math.round(px), yi = Math.round(py);
      if (xi < 0 || xi >= w || yi < 0 || yi >= h) continue;
      const p = yi * w + xi;
      const insideSubject = subj[p] === 1;

      if (insideSubject) {
        // SKIP large white regions entirely → clean transparent areas.
        if (whiteMask[p]) continue;

        const di = (yi * w + xi) * 4;
        const R = data[di], G = data[di + 1], B = data[di + 2];
        const lum = luma01(R, G, B);

        // GOLDEN RULE #2 — pure-black knockout.
        if (lum < LUM_BLACK_KNOCKOUT) continue;

        // GOLDEN RULE #3 — true highlight: skip dot (large whites already
        // skipped above; remaining are tiny edges → leave clean).
        if (lum > LUM_WHITE_PROTECT) continue;

        // GOLDEN RULE #4 — midtone radius from inverted luminance.
        const inv = 1 - lum;
        const r = MIN_DOT_RADIUS + inv * (MAX_RADIUS - MIN_DOT_RADIUS);
        ctx.fillStyle = `rgb(${R},${G},${B})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // ----- AURA: distance-based exponential fade, color from nearest subj.
      if (auraRadiusPx <= 0) continue;
      const d = dist[p];
      if (d >= auraRadiusPx) continue;
      const sx = nx[p], sy = ny[p];
      if (sx < 0) continue;
      const di = (sy * w + sx) * 4;
      const R = data[di], G = data[di + 1], B = data[di + 2];
      const lumS = luma01(R, G, B);
      if (lumS < LUM_BLACK_KNOCKOUT) continue;
      const inv = 1 - lumS;
      const baseR = MIN_DOT_RADIUS + inv * (MAX_RADIUS - MIN_DOT_RADIUS);

      // Exponential fade: fade^2 = quadratic ease-out.
      const fade = 1 - d / auraRadiusPx;
      const f2 = fade * fade;
      const radius = baseR * f2;
      if (radius < 0.4) continue;
      ctx.fillStyle = `rgba(${R},${G},${B},${fade.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas;
}

// ============================================================================
// 🟣 HYBRID — composites Rosette over Circular by intensity (0..1)
// 0 = pure circular ; 1 = pure rosette ; 0.5 = subtle interference.
// ============================================================================
async function renderHybrid(
  src: ImageData,
  dpi: number,
  lpi: number,
  angleDeg: number,
  auraRadiusPx: number,
  bgTolerance: number,
  intensity: number,
  onProgress?: ProgressFn,
): Promise<AnyCanvas> {
  const t = clamp01(intensity);
  const { width: w, height: h } = src;

  const circular = await renderCircular(
    src, dpi, lpi, angleDeg, auraRadiusPx, bgTolerance, onProgress, 25, 35,
  );
  const rosette = await renderRosette(src, dpi, lpi, onProgress, 60, 30);

  const out = makeCanvas(w, h);
  const ctx = ctx2d(out);
  ctx.clearRect(0, 0, w, h);

  // Layer the circular base, then composite rosette on top with alpha = t.
  ctx.globalAlpha = 1 - t * 0.5; // keep base visible even at high t
  ctx.drawImage(circular as CanvasImageSource, 0, 0);
  ctx.globalAlpha = t;
  ctx.drawImage(rosette as CanvasImageSource, 0, 0);
  ctx.globalAlpha = 1;
  return out;
}

// ============================================================================
// PUBLIC API
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
  rosetteIntensity?: number; // 0..1 — only used by HYBRID
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
  rosetteIntensity: 0.5,
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function processImage(
  source: HTMLImageElement,
  opts: HalftoneOptions = {},
  onProgress?: ProgressFn,
): Promise<Blob> {
  const o = { ...DEFAULT_OPTIONS, ...opts };

  onProgress?.("Resize → 3307×4930", 8);
  await tick();
  const stage = resizeTo(source, o.targetW, o.targetH);
  const sctx = ctx2d(stage);
  const rawData = sctx.getImageData(0, 0, o.targetW, o.targetH);

  onProgress?.("Print curves · contrast + saturation", 18);
  await tick();
  const data = preprocess(rawData);

  let outCanvas: AnyCanvas;
  if (o.mode === "rosette_cmyk") {
    outCanvas = await renderRosette(data, o.dpi, o.lpi, onProgress, 25, 65);
  } else if (o.mode === "round_clean") {
    outCanvas = await renderCircular(
      data, o.dpi, o.lpi, o.baseAngleDeg, o.auraRadiusPx, o.bgTolerance, onProgress, 25, 65,
    );
  } else {
    outCanvas = await renderHybrid(
      data, o.dpi, o.lpi, o.baseAngleDeg, o.auraRadiusPx, o.bgTolerance, o.rosetteIntensity, onProgress,
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
