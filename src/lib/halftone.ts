// ============================================================================
// HALFTONE PIPELINE — Real AM Halftone with full coverage
// 300 DPI · 3307×4930 px · Manual LPI / Angle / Dot Shape
// Optional Black Reticulated Aura (K-channel splatter behind subject)
// ============================================================================

export type ProgressFn = (stage: string, pct: number) => void;
export type HalftoneType = "circular" | "rosette_cmyk";
export type DotShape = "circular" | "elliptical";

// ---------------------------------------------------------------------------
// PNG DPI metadata injection
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
// Canvas / resize utilities
// ---------------------------------------------------------------------------
function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function lanczosKernel(x: number, a = 3): number {
  if (x === 0) return 1;
  if (x <= -a || x >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

function lanczosResize(src: HTMLCanvasElement, tw: number, th: number, a = 3): HTMLCanvasElement {
  const sw = src.width, sh = src.height;
  const sctx = src.getContext("2d")!;
  const srcData = sctx.getImageData(0, 0, sw, sh).data;
  const horiz = new Float32Array(tw * sh * 4);
  const xRatio = sw / tw;
  const xSupport = Math.max(1, xRatio) * a;
  for (let x = 0; x < tw; x++) {
    const cx = (x + 0.5) * xRatio - 0.5;
    const x0 = Math.max(0, Math.floor(cx - xSupport));
    const x1 = Math.min(sw - 1, Math.ceil(cx + xSupport));
    const weights: number[] = [];
    let wsum = 0;
    for (let sx = x0; sx <= x1; sx++) {
      const w = lanczosKernel((sx - cx) / Math.max(1, xRatio), a);
      weights.push(w);
      wsum += w;
    }
    for (let y = 0; y < sh; y++) {
      let r = 0, g = 0, b = 0, alpha = 0;
      for (let k = 0, sx = x0; sx <= x1; sx++, k++) {
        const w = weights[k];
        const i = (y * sw + sx) * 4;
        r += srcData[i] * w;
        g += srcData[i + 1] * w;
        b += srcData[i + 2] * w;
        alpha += srcData[i + 3] * w;
      }
      const oi = (y * tw + x) * 4;
      horiz[oi] = r / wsum;
      horiz[oi + 1] = g / wsum;
      horiz[oi + 2] = b / wsum;
      horiz[oi + 3] = alpha / wsum;
    }
  }
  const out = makeCanvas(tw, th);
  const octx = out.getContext("2d")!;
  const outData = octx.createImageData(tw, th);
  const yRatio = sh / th;
  const ySupport = Math.max(1, yRatio) * a;
  for (let y = 0; y < th; y++) {
    const cy = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.floor(cy - ySupport));
    const y1 = Math.min(sh - 1, Math.ceil(cy + ySupport));
    const weights: number[] = [];
    let wsum = 0;
    for (let sy = y0; sy <= y1; sy++) {
      const w = lanczosKernel((sy - cy) / Math.max(1, yRatio), a);
      weights.push(w);
      wsum += w;
    }
    for (let x = 0; x < tw; x++) {
      let r = 0, g = 0, b = 0, alpha = 0;
      for (let k = 0, sy = y0; sy <= y1; sy++, k++) {
        const w = weights[k];
        const i = (sy * tw + x) * 4;
        r += horiz[i] * w;
        g += horiz[i + 1] * w;
        b += horiz[i + 2] * w;
        alpha += horiz[i + 3] * w;
      }
      const oi = (y * tw + x) * 4;
      outData.data[oi] = Math.max(0, Math.min(255, r / wsum));
      outData.data[oi + 1] = Math.max(0, Math.min(255, g / wsum));
      outData.data[oi + 2] = Math.max(0, Math.min(255, b / wsum));
      outData.data[oi + 3] = Math.max(0, Math.min(255, alpha / wsum));
    }
  }
  octx.putImageData(outData, 0, 0);
  return out;
}

function resizeTo(src: HTMLCanvasElement | HTMLImageElement, tw: number, th: number): HTMLCanvasElement {
  const sw = "naturalWidth" in src ? src.naturalWidth : src.width;
  const sh = "naturalHeight" in src ? src.naturalHeight : src.height;
  let stage: HTMLCanvasElement;
  if (src instanceof HTMLCanvasElement) {
    stage = src;
  } else {
    stage = makeCanvas(sw, sh);
    stage.getContext("2d")!.drawImage(src, 0, 0);
  }
  while (stage.width * 0.5 > tw * 1.4 && stage.height * 0.5 > th * 1.4) {
    const next = makeCanvas(Math.round(stage.width * 0.5), Math.round(stage.height * 0.5));
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(stage, 0, 0, next.width, next.height);
    stage = next;
  }
  return lanczosResize(stage, tw, th, 3);
}

// ---------------------------------------------------------------------------
// Image processing primitives
// ---------------------------------------------------------------------------
function unsharpMask(img: ImageData, amount = 0.6, radius = 1): ImageData {
  const { width: w, height: h, data } = img;
  const blurred = new Uint8ClampedArray(data);
  const get = (x: number, y: number, c: number) => {
    const xi = Math.max(0, Math.min(w - 1, x));
    const yi = Math.max(0, Math.min(h - 1, y));
    return data[(yi * w + xi) * 4 + c];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) s += get(x + dx, y + dy, c);
        blurred[i + c] = s / ((radius * 2 + 1) * (radius * 2 + 1));
      }
    }
  }
  const out = new ImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c] + amount * (data[i + c] - blurred[i + c]);
      out.data[i + c] = Math.max(0, Math.min(255, v));
    }
    out.data[i + 3] = data[i + 3];
  }
  return out;
}

function applyLevelsAndGamma(
  img: ImageData,
  blackPoint = 0,
  whitePoint = 255,
  gammaLevels = 1.0,
  midtoneGamma = 1.0,
): ImageData {
  const lut = new Uint8ClampedArray(256);
  const range = Math.max(1, whitePoint - blackPoint);
  for (let i = 0; i < 256; i++) {
    let v = (i - blackPoint) / range;
    v = Math.max(0, Math.min(1, v));
    v = Math.pow(v, 1 / gammaLevels);
    v = Math.pow(v, 1 / midtoneGamma);
    lut[i] = Math.round(v * 255);
  }
  const out = new ImageData(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = lut[img.data[i]];
    out.data[i + 1] = lut[img.data[i + 1]];
    out.data[i + 2] = lut[img.data[i + 2]];
    out.data[i + 3] = img.data[i + 3];
  }
  return out;
}

function rgbToLuma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function applyVibrance(img: ImageData, amount = 0.15): ImageData {
  const out = new ImageData(img.width, img.height);
  const d = img.data, o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    const sat = (max - avg) / 255;
    const boost = amount * (1 - sat);
    o[i] = Math.max(0, Math.min(255, r + (r - avg) * boost));
    o[i + 1] = Math.max(0, Math.min(255, g + (g - avg) * boost));
    o[i + 2] = Math.max(0, Math.min(255, b + (b - avg) * boost));
    o[i + 3] = d[i + 3];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Subject mask (flood fill from corners) — used ONLY for the optional aura
// ---------------------------------------------------------------------------
function floodFillBackgroundMask(
  img: ImageData,
  tolerance = 32,
  featherPx = 3,
): Float32Array {
  const { width: w, height: h, data } = img;
  const total = w * h;
  const mask = new Float32Array(total);
  for (let i = 0; i < total; i++) mask[i] = 1;
  const isBg = new Uint8Array(total);

  const corners: [number, number][] = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
  ];

  const stack: number[] = [];
  const seedLumas: number[] = [];
  const seedRGB: [number, number, number][] = [];
  for (const [cx, cy] of corners) {
    const idx = cy * w + cx;
    const di = idx * 4;
    seedLumas.push(rgbToLuma(data[di], data[di + 1], data[di + 2]));
    seedRGB.push([data[di], data[di + 1], data[di + 2]]);
    if (!isBg[idx]) {
      isBg[idx] = 1;
      stack.push(idx);
    }
  }

  const matchesBg = (idx: number): boolean => {
    const di = idx * 4;
    const r = data[di], g = data[di + 1], b = data[di + 2];
    const luma = rgbToLuma(r, g, b);
    for (let s = 0; s < seedLumas.length; s++) {
      const [sr, sg, sb] = seedRGB[s];
      const dr = Math.abs(r - sr);
      const dg = Math.abs(g - sg);
      const db = Math.abs(b - sb);
      const dl = Math.abs(luma - seedLumas[s]);
      if (Math.max(dr, dg, db) <= tolerance && dl <= tolerance) return true;
    }
    return false;
  };

  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || isBg[n]) continue;
      if (matchesBg(n)) {
        isBg[n] = 1;
        stack.push(n);
      }
    }
  }

  for (let i = 0; i < total; i++) if (isBg[i]) mask[i] = 0;

  if (featherPx > 0) {
    const tmp = new Float32Array(total);
    const r = featherPx;
    const k = r * 2 + 1;
    const area = k * k;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = Math.max(0, Math.min(h - 1, y + dy));
          for (let dx = -r; dx <= r; dx++) {
            const xx = Math.max(0, Math.min(w - 1, x + dx));
            s += mask[yy * w + xx];
          }
        }
        tmp[y * w + x] = s / area;
      }
    }
    return tmp;
  }
  return mask;
}

// ---------------------------------------------------------------------------
// Distance transform (chamfer 3-4) — distance from subject edge (outside subject)
// ---------------------------------------------------------------------------
function distanceFromSubject(mask: Float32Array, w: number, h: number): Float32Array {
  const total = w * h;
  const INF = 1e9;
  const dist = new Float32Array(total);
  // 0 inside subject; INF outside
  for (let i = 0; i < total; i++) dist[i] = mask[i] > 0.5 ? 0 : INF;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let m = dist[i];
      if (x > 0) m = Math.min(m, dist[i - 1] + 3);
      if (y > 0) m = Math.min(m, dist[i - w] + 3);
      if (x > 0 && y > 0) m = Math.min(m, dist[i - w - 1] + 4);
      if (x < w - 1 && y > 0) m = Math.min(m, dist[i - w + 1] + 4);
      dist[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let m = dist[i];
      if (x < w - 1) m = Math.min(m, dist[i + 1] + 3);
      if (y < h - 1) m = Math.min(m, dist[i + w] + 3);
      if (x < w - 1 && y < h - 1) m = Math.min(m, dist[i + w + 1] + 4);
      if (x > 0 && y < h - 1) m = Math.min(m, dist[i + w - 1] + 4);
      dist[i] = m;
    }
  }
  for (let i = 0; i < total; i++) dist[i] /= 3;
  return dist;
}

// ---------------------------------------------------------------------------
// Value noise (fBm) — for organic aura splatter
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
// REAL AM HALFTONE — full coverage (NO highlight holes, NO background mask)
// • Highlights = tiny dots (still present)
// • Shadows = large dots
// • Background between dots = transparent (alpha 0)
// • Dot shape: circular OR elliptical (axis ratio 0.7)
// ---------------------------------------------------------------------------
function applyHalftoneAM(
  img: ImageData,
  dpi: number,
  lpi: number,
  angleDeg: number,
  dotShape: DotShape,
): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  const od = out.data;

  const cellPx = dpi / lpi;
  const cellArea = cellPx * cellPx;
  const angle = (angleDeg * Math.PI) / 180;
  const cosI = Math.cos(-angle), sinI = Math.sin(-angle);

  // Tonal range — keep highlights visible (3%) and shadows dense (98%)
  const COVER_MIN = 0.03;
  const COVER_MAX = 0.98;

  // Elliptical aspect (long/short axis)
  const ellipseAspect = dotShape === "elliptical" ? 1 / 0.7 : 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rPix = data[i], gPix = data[i + 1], bPix = data[i + 2];

      // Density from luma — every pixel gets a dot (no transparency holes)
      const luma = rgbToLuma(rPix, gPix, bPix) / 255;
      const density = 1 - luma;
      const coverage = COVER_MIN + (COVER_MAX - COVER_MIN) * density;

      // Dot radius (or semi-axes) sized to match coverage area
      const baseR = Math.sqrt((coverage * cellArea) / Math.PI);
      const ra = baseR * Math.sqrt(ellipseAspect); // long axis
      const rb = baseR / Math.sqrt(ellipseAspect); // short axis

      // Rotate into the screen grid
      const xr = x * cosI - y * sinI;
      const yr = x * sinI + y * cosI;
      const cxr = (Math.floor(xr / cellPx) + 0.5) * cellPx;
      const cyr = (Math.floor(yr / cellPx) + 0.5) * cellPx;
      const dxr = xr - cxr;
      const dyr = yr - cyr;
      const ex = dxr / ra;
      const ey = dyr / rb;
      const eDist = ex * ex + ey * ey;
      if (eDist > 1) continue; // outside dot → transparent

      // Soft anti-aliased edge on dot rim
      const softEdge = eDist > 0.81 ? Math.max(0, 1 - (eDist - 0.81) / 0.19) : 1;
      const alpha = Math.round(255 * softEdge);
      if (alpha <= 4) continue;

      od[i] = rPix;
      od[i + 1] = gPix;
      od[i + 2] = bPix;
      od[i + 3] = alpha;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// BLACK RETICULATED AURA — K-channel halftone behind subject
// • Lives only OUTSIDE the subject (mask=0 region)
// • Dots fade smaller + more spaced as distance from edge grows
// • fBm noise jitter creates organic "splatter" feel
// ---------------------------------------------------------------------------
function generateBlackAura(
  w: number,
  h: number,
  subjectMask: Float32Array,
  dpi: number,
  lpi: number,
  angleDeg: number,
  dotShape: DotShape,
  auraWidthPx: number,
  intensity: number, // 0..1 — peak coverage right at edge
  seed = 1337,
): ImageData {
  const out = new ImageData(w, h);
  const od = out.data;

  if (auraWidthPx <= 0 || intensity <= 0) return out;

  const dist = distanceFromSubject(subjectMask, w, h);
  const noise = makeValueNoise(seed);
  const noiseScale = 0.008;

  const cellPx = dpi / lpi;
  const cellArea = cellPx * cellPx;
  const angle = (angleDeg * Math.PI) / 180;
  const cosI = Math.cos(-angle), sinI = Math.sin(-angle);
  const ellipseAspect = dotShape === "elliptical" ? 1 / 0.7 : 1;

  const COVER_PEAK = 0.85 * intensity; // largest dot at edge
  const COVER_MIN = 0.0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      // Only render OUTSIDE the subject
      if (subjectMask[p] > 0.05) continue;
      const d = dist[p];
      if (d > auraWidthPx) continue;

      // Falloff: cubic dissipation away from edge
      const t = d / auraWidthPx; // 0 at edge → 1 at outer aura limit
      const falloff = Math.pow(1 - t, 1.6);
      // Noise jitter — creates splatter/uneven coverage
      const n = noise(x * noiseScale, y * noiseScale, 4, 2.1, 0.55);
      const noiseGate = 0.18 + t * 0.55; // requires more noise to survive far from edge
      if (n < noiseGate) continue;

      const coverage = COVER_MIN + (COVER_PEAK - COVER_MIN) * falloff * (0.6 + 0.8 * n);
      if (coverage <= 0.02) continue;

      const baseR = Math.sqrt((coverage * cellArea) / Math.PI);
      const ra = baseR * Math.sqrt(ellipseAspect);
      const rb = baseR / Math.sqrt(ellipseAspect);

      const xr = x * cosI - y * sinI;
      const yr = x * sinI + y * cosI;
      const cxr = (Math.floor(xr / cellPx) + 0.5) * cellPx;
      const cyr = (Math.floor(yr / cellPx) + 0.5) * cellPx;
      const dxr = xr - cxr;
      const dyr = yr - cyr;
      const ex = dxr / ra;
      const ey = dyr / rb;
      const eDist = ex * ex + ey * ey;
      if (eDist > 1) continue;

      const softEdge = eDist > 0.81 ? Math.max(0, 1 - (eDist - 0.81) / 0.19) : 1;
      const alpha = Math.round(255 * softEdge * Math.min(1, falloff * 1.4 + 0.1));
      if (alpha <= 4) continue;

      const i = p * 4;
      od[i] = 12;
      od[i + 1] = 12;
      od[i + 2] = 12;
      od[i + 3] = alpha;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Composite aura UNDER subject halftone
// ---------------------------------------------------------------------------
function compositeOver(top: ImageData, bottom: ImageData): ImageData {
  const { width: w, height: h } = top;
  const out = new ImageData(w, h);
  const t = top.data, b = bottom.data, o = out.data;
  for (let i = 0; i < t.length; i += 4) {
    const ta = t[i + 3] / 255;
    const ba = b[i + 3] / 255;
    const oa = ta + ba * (1 - ta);
    if (oa <= 0) continue;
    o[i] = Math.round((t[i] * ta + b[i] * ba * (1 - ta)) / oa);
    o[i + 1] = Math.round((t[i + 1] * ta + b[i + 1] * ba * (1 - ta)) / oa);
    o[i + 2] = Math.round((t[i + 2] * ta + b[i + 2] * ba * (1 - ta)) / oa);
    o[i + 3] = Math.round(oa * 255);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CMYK Rosette (kept for compatibility — simple version)
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

function halftoneChannel(
  channel: Float32Array,
  w: number,
  h: number,
  cellPx: number,
  angleDeg: number,
): Uint8Array {
  const dots = new Uint8Array(w * h);
  const angle = (angleDeg * Math.PI) / 180;
  const cosI = Math.cos(-angle), sinI = Math.sin(-angle);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xr = x * cosI - y * sinI;
      const yr = x * sinI + y * cosI;
      const cxr = (Math.floor(xr / cellPx) + 0.5) * cellPx;
      const cyr = (Math.floor(yr / cellPx) + 0.5) * cellPx;
      const dxr = xr - cxr;
      const dyr = yr - cyr;
      const distSq = dxr * dxr + dyr * dyr;
      const sxi = Math.max(0, Math.min(w - 1, x));
      const syi = Math.max(0, Math.min(h - 1, y));
      const coverage = channel[syi * w + sxi];
      if (coverage <= 0.01) continue;
      const r = Math.sqrt((coverage * cellPx * cellPx) / Math.PI);
      if (distSq <= r * r) dots[y * w + x] = 1;
    }
  }
  return dots;
}

function applyHalftoneRosette(
  img: ImageData,
  dpi = 300,
  lpi = 65,
): ImageData {
  const { width: w, height: h, data } = img;
  const total = w * h;
  const cellPx = dpi / lpi;
  const C = new Float32Array(total);
  const M = new Float32Array(total);
  const Y = new Float32Array(total);
  const K = new Float32Array(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const [c, m, y, k] = rgbToCmyk(data[i], data[i + 1], data[i + 2]);
    C[p] = c; M[p] = m; Y[p] = y; K[p] = k;
  }
  const dotsC = halftoneChannel(C, w, h, cellPx, 15);
  const dotsM = halftoneChannel(M, w, h, cellPx, 75);
  const dotsY = halftoneChannel(Y, w, h, cellPx, 0);
  const dotsK = halftoneChannel(K, w, h, cellPx, 45);
  const INK_C = { r: 0, g: 174, b: 239 };
  const INK_M = { r: 236, g: 0, b: 140 };
  const INK_Y = { r: 255, g: 237, b: 0 };
  const INK_K = { r: 20, g: 20, b: 20 };
  const out = new ImageData(w, h);
  const o = out.data;
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const hC = !!dotsC[p], hM = !!dotsM[p], hY = !!dotsY[p], hK = !!dotsK[p];
    if (!hC && !hM && !hY && !hK) continue;
    let r = 1, g = 1, b = 1;
    if (hC) { r *= INK_C.r / 255; g *= INK_C.g / 255; b *= INK_C.b / 255; }
    if (hM) { r *= INK_M.r / 255; g *= INK_M.g / 255; b *= INK_M.b / 255; }
    if (hY) { r *= INK_Y.r / 255; g *= INK_Y.g / 255; b *= INK_Y.b / 255; }
    if (hK) { r *= INK_K.r / 255; g *= INK_K.g / 255; b *= INK_K.b / 255; }
    o[i] = Math.round(r * 255);
    o[i + 1] = Math.round(g * 255);
    o[i + 2] = Math.round(b * 255);
    o[i + 3] = 255;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pipeline options + defaults
// ---------------------------------------------------------------------------
export interface HalftoneOptions {
  targetW?: number;
  targetH?: number;
  dpi?: number;
  // MANUAL CONTROLS
  lpi?: number;          // 20–100, default 65
  angleDeg?: number;     // 0–90,  default 45
  dotShape?: DotShape;   // circular | elliptical
  // Image processing
  blackPoint?: number;
  whitePoint?: number;
  gammaLevels?: number;
  midtoneGamma?: number;
  unsharpAmount?: number;
  vibrance?: number;
  halftoneType?: HalftoneType;
  // Outer aura
  outerAura?: boolean;
  auraWidthPx?: number;     // width of K-channel splatter zone (px @ output)
  auraIntensity?: number;   // 0..1
  auraSeed?: number;
  // Aura subject detection
  bgTolerance?: number;
  featherPx?: number;
}

export const DEFAULT_OPTIONS: Required<HalftoneOptions> = {
  targetW: 3307,
  targetH: 4930,
  dpi: 300,
  lpi: 65,
  angleDeg: 45,
  dotShape: "circular",
  blackPoint: 0,
  whitePoint: 255,
  gammaLevels: 1.0,
  midtoneGamma: 1.0,
  unsharpAmount: 0.5,
  vibrance: 0.15,
  halftoneType: "circular",
  outerAura: false,
  auraWidthPx: 280,
  auraIntensity: 0.85,
  auraSeed: 1337,
  bgTolerance: 38,
  featherPx: 4,
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

  onProgress?.("Resize Lanczos", 5);
  await tick();
  const resized = resizeTo(source, tw, th);

  onProgress?.("Reading pixels", 12);
  await tick();
  const ctx = resized.getContext("2d")!;
  let data = ctx.getImageData(0, 0, tw, th);

  onProgress?.("Unsharp Mask", 20);
  await tick();
  if (o.unsharpAmount > 0) data = unsharpMask(data, o.unsharpAmount, 1);

  onProgress?.("Levels + gamma", 30);
  await tick();
  data = applyLevelsAndGamma(data, o.blackPoint, o.whitePoint, o.gammaLevels, o.midtoneGamma);

  onProgress?.("Vibrance", 38);
  await tick();
  if (o.vibrance > 0) data = applyVibrance(data, o.vibrance);

  // Optional subject mask — ONLY for the outer aura (NOT used to gate halftone coverage)
  let subjectMask: Float32Array | null = null;
  if (o.outerAura) {
    onProgress?.("Detecting subject silhouette", 46);
    await tick();
    subjectMask = floodFillBackgroundMask(data, o.bgTolerance, o.featherPx);
  }

  const effectiveDpi = previewMaxDim ? (o.dpi * tw) / o.targetW : o.dpi;
  const auraWidthScaled = o.auraWidthPx * (tw / o.targetW);

  onProgress?.(`AM Halftone @ ${o.lpi} LPI / ${o.angleDeg}°`, 60);
  await tick();
  let halftone: ImageData;
  if (o.halftoneType === "rosette_cmyk") {
    halftone = applyHalftoneRosette(data, effectiveDpi, o.lpi);
  } else {
    halftone = applyHalftoneAM(data, effectiveDpi, o.lpi, o.angleDeg, o.dotShape);
  }

  if (o.outerAura && subjectMask) {
    onProgress?.("Generating black reticulated aura", 78);
    await tick();
    const aura = generateBlackAura(
      tw, th,
      subjectMask,
      effectiveDpi,
      o.lpi,
      o.angleDeg,
      o.dotShape,
      auraWidthScaled,
      o.auraIntensity,
      o.auraSeed,
    );
    onProgress?.("Compositing layers", 88);
    await tick();
    halftone = compositeOver(halftone, aura);
  }

  onProgress?.("Exporting PNG-32 (RGBA)", 95);
  await tick();
  ctx.putImageData(halftone, 0, 0);
  const blob: Blob = await new Promise((res) =>
    resized.toBlob((b) => res(b!), "image/png"),
  );

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
