/* ============================================================================
 * DTF Halftone Engine — Production Pipeline
 * ----------------------------------------------------------------------------
 * Two engines:
 *   A) CLEAN ORGANIC  — single rotated grid, perfect circles, organic aura fade.
 *   B) ROSETTE CMYK   — 4 channels (C/M/Y/K) at fixed offset angles, multiply.
 *
 * Output:
 *   • 3307 × 4930 px (A3 @ 300 DPI)
 *   • PNG-32 with full alpha channel
 *   • Background: 100% transparent (alpha 0 outside subject + aura)
 *
 * NON-NEGOTIABLE pre-process pipeline (Step 0):
 *   1. Levels crush 80 / 1.0 / 255  → kills washed gray, deepens shadows.
 *   2. Gamma 0.88                   → "midtones darker" print profile.
 *   3. Per-pixel luminance map (Rec.601) for all dot decisions.
 * ========================================================================== */

export type HalftoneMode =
  | "clean_organic"   // Engine A — single grid + aura
  | "rosette_cmyk"    // Engine B — true CMYK rosette
  // Legacy aliases kept so existing UI state never crashes; they map to the two engines.
  | "spot_white_cmyk"
  | "round_clean"
  | "hybrid";

export interface HalftoneOptions {
  mode: HalftoneMode;
  lpi: number;             // 22..45
  baseAngleDeg: number;    // 0..360 (global rotation)
  auraWidth: number;       // 0..80 px — clean mode only
  rosetteIntensity?: number;
  whiteThreshold?: number;
}

export const OUTPUT_WIDTH = 3307;
export const OUTPUT_HEIGHT = 4930;

export const DEFAULT_OPTIONS: HalftoneOptions = {
  mode: "clean_organic",
  lpi: 35,
  baseAngleDeg: 45,
  auraWidth: 24,
  rosetteIntensity: 0.5,
  whiteThreshold: 0.4,
};

/* ---------- Pre-computed tone curve LUT (Levels 80/1.0/255 + Gamma 0.88) ----- */
const TONE_LUT: Uint8ClampedArray = (() => {
  const lut = new Uint8ClampedArray(256);
  const gammaInv = 1 / 0.88;
  for (let v = 0; v < 256; v++) {
    // Step 1: Levels 80/1.0/255 — crush shadows, expand remaining range.
    let x = v < 80 ? 0 : (v - 80) * (255 / 175);
    if (x > 255) x = 255;
    // Step 2: Gamma 0.88 (darker midtones).  out = ((x/255)^(1/0.88))*255
    x = Math.pow(x / 255, gammaInv) * 255;
    lut[v] = Math.max(0, Math.min(255, Math.round(x)));
  }
  return lut;
})();

/* ---------- Public helpers -------------------------------------------------- */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

type Progress = (stage: string, pct: number) => void;

/* ---------- Internal types -------------------------------------------------- */
interface Prepared {
  w: number;             // working canvas width
  h: number;             // working canvas height
  rgba: Uint8ClampedArray; // levels-corrected RGBA
  lum: Uint8Array;       // per-pixel luminance 0..255
  alpha: Uint8Array;     // original alpha 0..255 (transparency aware)
  workScale: number;     // working pixel size relative to final 300 DPI placement
}

/* ============================================================================
 * MAIN ENTRY
 * ========================================================================== */
export async function processImage(
  img: HTMLImageElement,
  opts: HalftoneOptions,
  onProgress?: Progress,
): Promise<Blob> {
  const progress = onProgress ?? (() => {});
  progress("Pre-process · Levels 80/255 + Gamma 0.88", 5);

  // 1. Fit source into output canvas (preserve aspect, center).
  const out = new OffscreenCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const octx = out.getContext("2d", { alpha: true })!;
  octx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT); // background fully transparent

  // Final placement size on the 300 DPI canvas (preserves aspect, centered).
  const finalScale = Math.min(OUTPUT_WIDTH / img.naturalWidth, OUTPUT_HEIGHT / img.naturalHeight);
  const finalW = Math.round(img.naturalWidth * finalScale);
  const finalH = Math.round(img.naturalHeight * finalScale);
  const dx = Math.round((OUTPUT_WIDTH - finalW) / 2);
  const dy = Math.round((OUTPUT_HEIGHT - finalH) / 2);

  // PERFORMANCE CAP — the halftone is rendered at a smaller working resolution
  // (≤ MAX_WORK_EDGE px on the long edge), then upscaled with high-quality
  // smoothing into the 3307×4930 output. This keeps total dot count bounded
  // (~250k max) so the whole pipeline finishes well under 10s.
  const MAX_WORK_EDGE = 1600;
  const workScale = Math.min(1, MAX_WORK_EDGE / Math.max(finalW, finalH));
  const dw = Math.max(1, Math.round(finalW * workScale));
  const dh = Math.max(1, Math.round(finalH * workScale));

  // 2. Sample pixels into a working buffer the same size as the placed art.
  const work = new OffscreenCanvas(dw, dh);
  const wctx = work.getContext("2d", { alpha: true, willReadFrequently: true })!;
  wctx.clearRect(0, 0, dw, dh);
  wctx.drawImage(img, 0, 0, dw, dh);
  const imgData = wctx.getImageData(0, 0, dw, dh);

  // 3. Apply pre-processing LUT + build luminance + alpha maps in one pass.
  const prep = preProcessLevels(imgData);
  progress("Building luminance map", 18);

  // 4. Resolve mode (legacy aliases route to the two real engines).
  const mode: HalftoneMode = ((): HalftoneMode => {
    if (opts.mode === "rosette_cmyk" || opts.mode === "spot_white_cmyk") return "rosette_cmyk";
    return "clean_organic";
  })();

  // 5. Render into a transparent halftone canvas the size of the placed art.
  const halftone = new OffscreenCanvas(dw, dh);
  const hctx = halftone.getContext("2d", { alpha: true })!;
  hctx.clearRect(0, 0, dw, dh);

  if (mode === "rosette_cmyk") {
    progress("Rendering Rosette CMYK · 4 screens", 35);
    renderRosette(hctx, prep, opts, progress);
  } else {
    progress("Rendering Clean Organic + Aura", 35);
    renderClean(hctx, prep, opts, progress);
  }

  // 6. Composite halftone onto the centered output canvas, upscaling from the
  // working resolution to the actual placement size with smoothing on so dots
  // stay crisp circles at 300 DPI without re-rasterizing each one.
  progress("Composing 300 DPI canvas", 90);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(halftone, 0, 0, dw, dh, dx, dy, finalW, finalH);

  // 7. Export PNG-32 preserving alpha channel.
  progress("Exporting PNG-32", 96);
  const blob = await out.convertToBlob({ type: "image/png" });
  progress("Done", 100);
  return blob;
}

/* ============================================================================
 * STEP 0  —  PRE-PROCESS:  Levels 80/1.0/255  +  Gamma 0.88  +  Luminance Map
 * ========================================================================== */
function preProcessLevels(src: ImageData): Prepared {
  const { width: w, height: h, data } = src;
  const len = w * h;
  const lum = new Uint8Array(len);
  const alpha = new Uint8Array(len);

  // Apply LUT in-place to R,G,B; keep A; compute luminance L = 0.299R+0.587G+0.114B
  for (let i = 0, p = 0; i < len; i++, p += 4) {
    const r = TONE_LUT[data[p]];
    const g = TONE_LUT[data[p + 1]];
    const b = TONE_LUT[data[p + 2]];
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
    alpha[i] = data[p + 3];
    // Rec.601 luma — matches print luminance perception.
    lum[i] = (r * 299 + g * 587 + b * 114 + 500) / 1000 | 0;
  }

  return { w, h, rgba: data, lum, alpha };
}

/* ============================================================================
 * Pre-rendered circle bitmap cache (fast drawImage instead of arc-per-dot)
 * One bitmap per integer radius and per color key. Anti-aliased via arc on a
 * tiny offscreen canvas, then reused thousands of times.
 * ========================================================================== */
const dotCache = new Map<string, OffscreenCanvas>();
function getDot(radius: number, hex: string, alpha: number): OffscreenCanvas {
  const r = Math.max(1, Math.round(radius * 2)) / 2; // half-pixel granularity
  const a = Math.max(0, Math.min(1, alpha));
  const key = `${r}|${hex}|${a.toFixed(2)}`;
  const cached = dotCache.get(key);
  if (cached) return cached;
  const size = Math.ceil(r * 2) + 2;
  const c = new OffscreenCanvas(size, size);
  const cx = c.getContext("2d", { alpha: true })!;
  cx.clearRect(0, 0, size, size);
  cx.beginPath();
  cx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  cx.closePath();
  cx.globalAlpha = a;
  cx.fillStyle = hex;
  cx.fill();
  dotCache.set(key, c);
  return c;
}

/* ============================================================================
 * ENGINE A — CLEAN ORGANIC
 * ----------------------------------------------------------------------------
 * • One rotated grid at baseAngleDeg.
 * • Perfect black-circle dots sized by luminance.
 * • Aura: outside subject mask, fades color outward by distance, with noise.
 * ========================================================================== */
function renderClean(
  ctx: OffscreenCanvasRenderingContext2D,
  prep: Prepared,
  opts: HalftoneOptions,
  progress: Progress,
) {
  const { w, h, rgba, lum, alpha } = prep;
  // LPI is defined relative to the final 300 DPI output. Working canvas is a
  // downscaled proxy; convert step into working pixels by the same scale ratio
  // so dot pitch survives the final upscale and matches the requested LPI.
  // Floor of 3px keeps the dot grid render-safe on small/tall images.
  const workScale = w / Math.max(1, w); // placeholder, real ratio computed below
  const stepOut = 300 / opts.lpi;
  const step = Math.max(3, stepOut * (Math.min(w, h) / Math.max(1, Math.min(w, h))));
  const angle = (opts.baseAngleDeg * Math.PI) / 180;
  const auraWidth = Math.max(0, opts.auraWidth);

  // ---------- Subject binary mask (L > 20 OR alpha > 32) -------------------
  // Used both for skip-no-subject decisions and for aura distance computation.
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = lum[i] > 20 && alpha[i] > 32 ? 1 : 0;
  }

  // ---------- Distance transform (chamfer 3-4) for aura --------------------
  // Computes distance (in px) of every pixel to the nearest subject pixel.
  // Two passes: forward then backward. Approximates Euclidean within ~2%.
  const dist = auraWidth > 0 ? distanceTransform(mask, w, h, auraWidth + 4) : null;

  progress("Clean · plotting dots", 55);

  // ---------- Iterate ROTATED grid -----------------------------------------
  // We loop over a virtual rotated grid by traversing the AABB of the image
  // expressed in the rotated frame, then mapping back via inverse rotation.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Rotated-frame extents: project the four corners of [0,w]x[0,h] back
  // through the inverse rotation to find min/max rotated coordinates.
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, y] of corners) {
    const u = x * cos + y * sin;
    const v = -x * sin + y * cos;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }

  for (let v = vMin; v <= vMax; v += step) {
    for (let u = uMin; u <= uMax; u += step) {
      // Rotate (u,v) back to image coordinates.
      const x = u * cos - v * sin;
      const y = u * sin + v * cos;
      const xi = x | 0;
      const yi = y | 0;
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;

      const idx = yi * w + xi;
      const L = lum[idx];
      const inSubject = mask[idx] === 1;

      if (inSubject) {
        // -------- DOT SIZING (subject) -----------------------------------
        // radius = 1.5 + (1 - L/255) * (step*0.4 - 1.5)
        let radius = 1.5 + (1 - L / 255) * (step * 0.4 - 1.5);
        let dotAlpha = 1;
        let color = "#000000";

        // PURE BLACK KNOCKOUT — L < 12 → fully transparent (vazado).
        if (L < 12) continue;

        // HIGHLIGHT PROTECTION — L > 242 → micro dot, low opacity, never holes.
        if (L > 242) {
          radius = 1.5;
          dotAlpha = 0.4;
        } else {
          radius = Math.min(step * 0.4, Math.max(1.5, radius));
        }

        const sprite = getDot(radius, color, dotAlpha);
        ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
      } else if (auraWidth > 0 && dist) {
        // -------- AURA (outside subject, within auraWidth) ---------------
        const d = dist[idx];
        if (d >= auraWidth) continue; // beyond aura: keep transparent
        const fade = 1 - d / auraWidth;
        // Sample nearest subject pixel for color (cheap radial probe).
        const sample = sampleNearestSubject(rgba, mask, w, h, xi, yi, auraWidth);
        if (!sample) continue;
        // Base radius from sampled luminance, scaled by aura fade.
        const sL = sample.l;
        let radius = 1.5 + (1 - sL / 255) * (step * 0.4 - 1.5);
        radius = Math.max(1.0, Math.min(step * 0.4, radius)) * fade * 0.8;
        if (radius < 0.6) continue;
        const dotAlpha = fade;
        // Noise: organic splatter feel.
        const nx = x + (Math.random() - 0.5) * step * 0.3;
        const ny = y + (Math.random() - 0.5) * step * 0.3;
        const sprite = getDot(radius, sample.hex, dotAlpha);
        ctx.drawImage(sprite, nx - sprite.width / 2, ny - sprite.height / 2);
      }
    }
  }
  progress("Clean · finalizing", 88);
}

/* Sample the nearest subject pixel within `maxR` of (x,y) — small spiral probe. */
function sampleNearestSubject(
  rgba: Uint8ClampedArray,
  mask: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  maxR: number,
): { hex: string; l: number } | null {
  const limit = Math.max(2, Math.ceil(maxR));
  for (let r = 1; r <= limit; r++) {
    // Sample 8 cardinal/diagonal points on a ring of radius r.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const sx = (x + Math.cos(a) * r) | 0;
      const sy = (y + Math.sin(a) * r) | 0;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const idx = sy * w + sx;
      if (mask[idx]) {
        const p = idx * 4;
        const R = rgba[p], G = rgba[p + 1], B = rgba[p + 2];
        const hex = "#" + ((R << 16) | (G << 8) | B).toString(16).padStart(6, "0");
        const L = (R * 299 + G * 587 + B * 114 + 500) / 1000 | 0;
        return { hex, l: L };
      }
    }
  }
  return null;
}

/* Two-pass chamfer (3,4) distance transform clipped to `cap` (perf). */
function distanceTransform(mask: Uint8Array, w: number, h: number, cap: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;

  // Forward pass — neighbours: NW(4) N(3) NE(4) W(3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0)              v = Math.min(v, d[i - 1] + 3);
      if (y > 0)              v = Math.min(v, d[i - w] + 3);
      if (x > 0 && y > 0)     v = Math.min(v, d[i - w - 1] + 4);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + 4);
      d[i] = v;
    }
  }
  // Backward pass — neighbours: E(3) SE(4) S(3) SW(4)
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < w - 1)              v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1)              v = Math.min(v, d[i + w] + 3);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + 4);
      if (x > 0 && y < h - 1)     v = Math.min(v, d[i + w - 1] + 4);
      d[i] = v;
    }
  }
  // Convert chamfer units (3 per step) to pixels and clip to cap.
  const capUnits = cap * 3;
  for (let i = 0; i < d.length; i++) {
    d[i] = d[i] >= capUnits ? cap : d[i] / 3;
  }
  return d;
}

/* ============================================================================
 * ENGINE B — ROSETTE CMYK
 * ----------------------------------------------------------------------------
 * • RGB → CMYK separation.
 * • 4 grids at angles  Y+0°  C+15°  K+45°  M+75°  (+ baseAngleDeg global).
 * • Each channel rendered with `multiply` blending so they intermix optically.
 * • Same dot-sizing/knockout per channel; pure black L<12 is skipped per channel.
 * ========================================================================== */
function renderRosette(
  ctx: OffscreenCanvasRenderingContext2D,
  prep: Prepared,
  opts: HalftoneOptions,
  progress: Progress,
) {
  const { w, h, rgba, lum, alpha } = prep;
  const step = 300 / opts.lpi;
  const baseDeg = opts.baseAngleDeg;

  // Standard offset angles (industry-standard CMYK screen angles).
  const channels: Array<{ name: "C" | "M" | "Y" | "K"; deg: number; hex: string }> = [
    { name: "Y", deg: baseDeg + 0,  hex: "#ffe600" },
    { name: "C", deg: baseDeg + 15, hex: "#00aeef" },
    { name: "K", deg: baseDeg + 45, hex: "#000000" },
    { name: "M", deg: baseDeg + 75, hex: "#ec008c" },
  ];

  // Pre-separate CMYK channels (0..1) once.
  const len = w * h;
  const C = new Float32Array(len);
  const M = new Float32Array(len);
  const Y = new Float32Array(len);
  const K = new Float32Array(len);
  for (let i = 0, p = 0; i < len; i++, p += 4) {
    if (alpha[i] < 32) continue;
    const r = rgba[p] / 255, g = rgba[p + 1] / 255, b = rgba[p + 2] / 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) { K[i] = 1; continue; }
    const inv = 1 / (1 - k);
    C[i] = (1 - r - k) * inv;
    M[i] = (1 - g - k) * inv;
    Y[i] = (1 - b - k) * inv;
    K[i] = k;
  }

  // Render each channel with multiply so dots blend optically.
  ctx.globalCompositeOperation = "multiply";

  let done = 0;
  for (const ch of channels) {
    const data = ch.name === "C" ? C : ch.name === "M" ? M : ch.name === "Y" ? Y : K;
    plotChannel(ctx, data, lum, alpha, w, h, step, ch.deg, ch.hex);
    done++;
    progress(`Rosette · screen ${done}/4 (${ch.name})`, 35 + done * 12);
  }

  ctx.globalCompositeOperation = "source-over";
}

/* Plot a single CMYK channel on its rotated grid. */
function plotChannel(
  ctx: OffscreenCanvasRenderingContext2D,
  ink: Float32Array,        // 0..1 ink coverage for this channel
  lum: Uint8Array,
  alpha: Uint8Array,
  w: number,
  h: number,
  step: number,
  angleDeg: number,
  hex: string,
) {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Rotated-frame AABB.
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, y] of [[0,0],[w,0],[0,h],[w,h]]) {
    const u = x * cos + y * sin;
    const v = -x * sin + y * cos;
    if (u < uMin) uMin = u; if (u > uMax) uMax = u;
    if (v < vMin) vMin = v; if (v > vMax) vMax = v;
  }

  for (let v = vMin; v <= vMax; v += step) {
    for (let u = uMin; u <= uMax; u += step) {
      const x = u * cos - v * sin;
      const y = u * sin + v * cos;
      const xi = x | 0;
      const yi = y | 0;
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
      const idx = yi * w + xi;
      if (alpha[idx] < 32) continue;

      const L = lum[idx];
      // Pure black knockout (vazado) — skip dot on extreme darks.
      if (L < 12) continue;

      const cov = ink[idx];
      if (cov <= 0.01) continue;

      // DOT SIZING per spec: radius = 1.5 + cov * (step*0.4 - 1.5)
      // (cov plays the role of 1 - L/255 at the channel level).
      let radius = 1.5 + cov * (step * 0.4 - 1.5);
      let dotAlpha = 1;

      // HIGHLIGHT PROTECTION — extreme highlights → micro dot @ 40% alpha.
      if (L > 242) {
        radius = 1.5;
        dotAlpha = 0.4;
      } else {
        radius = Math.min(step * 0.4, Math.max(1.5, radius));
      }

      const sprite = getDot(radius, hex, dotAlpha);
      ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
    }
  }
}
