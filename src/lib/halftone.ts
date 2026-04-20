// ============================================================================
// HALFTONE PIPELINE — Offset de Alta Fidelidade
// 300 DPI · 3307×4961 px · AM Halftone 35 LPI · Pontos Circulares ou Rosette CMYK
// ============================================================================

export type ProgressFn = (stage: string, pct: number) => void;
export type HalftoneType = "circular" | "rosette";

// PNG signature + helpers para injetar pHYs (300 DPI)
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
// Resize de alta qualidade
// ---------------------------------------------------------------------------
function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// Sinc Lanczos (a=3) — nitidez de pré-impressão
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

  // Passo horizontal: sw×sh -> tw×sh
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

  // Passo vertical: tw×sh -> tw×th
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
  // Coloca em canvas para manipular pixels
  let stage: HTMLCanvasElement;
  if (src instanceof HTMLCanvasElement) {
    stage = src;
  } else {
    stage = makeCanvas(sw, sh);
    stage.getContext("2d")!.drawImage(src, 0, 0);
  }
  // Pré-downscale rápido por etapas até ficar perto do alvo (acelera Lanczos)
  while (stage.width * 0.5 > tw * 1.4 && stage.height * 0.5 > th * 1.4) {
    const next = makeCanvas(Math.round(stage.width * 0.5), Math.round(stage.height * 0.5));
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(stage, 0, 0, next.width, next.height);
    stage = next;
  }
  // Upscale também usa Lanczos quando necessário
  return lanczosResize(stage, tw, th, 3);
}

// ---------------------------------------------------------------------------
// Unsharp Mask
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

// ---------------------------------------------------------------------------
// Levels + Gamma
// ---------------------------------------------------------------------------
function applyLevelsAndGamma(
  img: ImageData,
  blackPoint = 80,
  whitePoint = 255,
  gammaLevels = 1.0,
  midtoneGamma = 0.7
): ImageData {
  const lut = new Uint8ClampedArray(256);
  const range = whitePoint - blackPoint;
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

// ---------------------------------------------------------------------------
// FLOOD FILL a partir dos 4 cantos — preserva brancos internos do personagem
// ---------------------------------------------------------------------------
function floodFillBackgroundMask(
  img: ImageData,
  tolerance = 32,
  featherPx = 3
): Float32Array {
  const { width: w, height: h, data } = img;
  const total = w * h;
  // mask: 1 = subject (opaco), 0 = background (transparente)
  const mask = new Float32Array(total);
  for (let i = 0; i < total; i++) mask[i] = 1;

  // visitado pelo flood = é fundo
  const isBg = new Uint8Array(total);

  // Amostra cor de cada canto e enfileira como semente
  const corners: [number, number][] = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];

  // Stack-based flood fill (4-conectividade) com tolerância em luma + RGB
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
      // Aceita se diferença máxima de canal E luma estão dentro da tolerância
      if (Math.max(dr, dg, db) <= tolerance && dl <= tolerance) return true;
    }
    return false;
  };

  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    // 4 vizinhos
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

  // mask = 0 onde isBg, 1 caso contrário
  for (let i = 0; i < total; i++) if (isBg[i]) mask[i] = 0;

  // Feather: box blur na máscara para suavizar borda
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

function applyMaskToRGBA(img: ImageData, mask: Float32Array): ImageData {
  const out = new ImageData(img.width, img.height);
  const d = img.data, o = out.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    o[i] = d[i];
    o[i + 1] = d[i + 1];
    o[i + 2] = d[i + 2];
    o[i + 3] = Math.round((d[i + 3] / 255) * mask[p] * 255);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Halftone AM circular (single-channel grayscale-driven, RGB color preservada)
// ---------------------------------------------------------------------------
function applyHalftoneCircular(
  img: ImageData,
  dpi = 300,
  lpi = 35,
  angleDeg = 22,
  mask?: Float32Array
): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  const cellPx = dpi / lpi;
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const cosI = Math.cos(-angle), sinI = Math.sin(-angle);
  const maxR = cellPx * 0.5 * Math.SQRT2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const xr = x * cosI - y * sinI;
      const yr = x * sinI + y * cosI;
      const cxr = (Math.floor(xr / cellPx) + 0.5) * cellPx;
      const cyr = (Math.floor(yr / cellPx) + 0.5) * cellPx;
      const dxr = xr - cxr;
      const dyr = yr - cyr;
      const dist = Math.sqrt(dxr * dxr + dyr * dyr);
      const cx = Math.round(cxr * cos - cyr * sin);
      const cy = Math.round(cxr * sin + cyr * cos);
      const sxi = Math.max(0, Math.min(w - 1, cx));
      const syi = Math.max(0, Math.min(h - 1, cy));
      const si = (syi * w + sxi) * 4;
      const luma = rgbToLuma(data[si], data[si + 1], data[si + 2]) / 255;
      const cellMask = mask ? mask[syi * w + sxi] : 1;
      const pixelMask = mask ? mask[y * w + x] : 1;
      const toneMask = Math.min(cellMask, pixelMask);
      if (toneMask <= 0.01) continue;
      const coverage = (1 - luma) * toneMask;
      if (coverage <= 0.01) continue;
      const r = Math.sqrt((coverage * cellPx * cellPx) / Math.PI);
      const insideDot = dist <= r;
      const insideCorner = dist <= maxR && coverage > 0.92;
      if (insideDot || insideCorner) {
        out.data[i] = data[si];
        out.data[i + 1] = data[si + 1];
        out.data[i + 2] = data[si + 2];
        out.data[i + 3] = Math.round(255 * toneMask);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Halftone ROSETTE — separação CMYK + 4 ângulos clássicos + multiply
// C: 15° · M: 75° · Y: 0° · K: 45°
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

/** Gera mapa binário (1 onde tem ponto) para um canal em ângulo dado. */
function halftoneChannel(
  channel: Float32Array, // valores 0..1 (cobertura desejada)
  w: number,
  h: number,
  cellPx: number,
  angleDeg: number,
  mask?: Float32Array
): Uint8Array {
  const dots = new Uint8Array(w * h);
  const angle = (angleDeg * Math.PI) / 180;
  const cosI = Math.cos(-angle), sinI = Math.sin(-angle);
  const maxR = cellPx * 0.5 * Math.SQRT2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xr = x * cosI - y * sinI;
      const yr = x * sinI + y * cosI;
      const cxr = (Math.floor(xr / cellPx) + 0.5) * cellPx;
      const cyr = (Math.floor(yr / cellPx) + 0.5) * cellPx;
      const dxr = xr - cxr;
      const dyr = yr - cyr;
      const dist = Math.sqrt(dxr * dxr + dyr * dyr);
      // amostra cobertura no centro da célula (rotação inversa de volta)
      const cs = Math.cos(angle), ss = Math.sin(angle);
      const sx = Math.round(cxr * cs - cyr * ss);
      const sy = Math.round(cxr * ss + cyr * cs);
      const sxi = Math.max(0, Math.min(w - 1, sx));
      const syi = Math.max(0, Math.min(h - 1, sy));
      const cellMask = mask ? mask[syi * w + sxi] : 1;
      if (cellMask <= 0.01) continue;
      const coverage = channel[syi * w + sxi] * cellMask;
      if (coverage <= 0.01) continue;
      const r = Math.sqrt((coverage * cellPx * cellPx) / Math.PI);
      if (dist <= r || (dist <= maxR && coverage > 0.95)) {
        dots[y * w + x] = 1;
      }
    }
  }
  return dots;
}

function applyHalftoneRosette(
  img: ImageData,
  dpi = 300,
  lpi = 35,
  mask?: Float32Array
): ImageData {
  const { width: w, height: h, data } = img;
  const total = w * h;
  const cellPx = dpi / lpi;

  // Separação CMYK
  const C = new Float32Array(total);
  const M = new Float32Array(total);
  const Y = new Float32Array(total);
  const K = new Float32Array(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const [c, m, y, k] = rgbToCmyk(data[i], data[i + 1], data[i + 2]);
    C[p] = c; M[p] = m; Y[p] = y; K[p] = k;
  }

  // Halftone por canal nos ângulos clássicos
  const dotsC = halftoneChannel(C, w, h, cellPx, 15, mask);
  const dotsM = halftoneChannel(M, w, h, cellPx, 75, mask);
  const dotsY = halftoneChannel(Y, w, h, cellPx, 0, mask);
  const dotsK = halftoneChannel(K, w, h, cellPx, 45, mask);

  // Composição multiplicativa (papel branco) — cada ponto subtrai sua cor complementar
  const out = new ImageData(w, h);
  const o = out.data;
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const m = mask ? mask[p] : 1;
    if (m <= 0.01) continue;

    let r = 1, g = 1, b = 1;
    let hasDot = false;
    if (dotsC[p]) { r *= 0; g *= 1; b *= 1; hasDot = true; }       // Cyan = (0,255,255)
    if (dotsM[p]) { r *= 1; g *= 0; b *= 1; hasDot = true; }       // Magenta = (255,0,255)
    if (dotsY[p]) { r *= 1; g *= 1; b *= 0; hasDot = true; }       // Yellow = (255,255,0)
    if (dotsK[p]) { r = 0; g = 0; b = 0; hasDot = true; }          // Black domina
    if (!hasDot) continue;

    o[i] = Math.round(r * 255);
    o[i + 1] = Math.round(g * 255);
    o[i + 2] = Math.round(b * 255);
    o[i + 3] = Math.round(255 * m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// High-Key warm tone
// ---------------------------------------------------------------------------
function applyHighKeyWarmCurve(img: ImageData, warmth = 0.08, lift = 0.12): ImageData {
  const out = new ImageData(img.width, img.height);
  const d = img.data, o = out.data;
  const gamma = 1 / (1 + lift * 1.5);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const v = Math.pow(i / 255, gamma);
    lut[i] = Math.round(v * 255);
  }
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]];
    let g = lut[d[i + 1]];
    let b = lut[d[i + 2]];
    r = Math.min(255, Math.round(r + warmth * 255 * 0.6));
    g = Math.min(255, Math.round(g + warmth * 255 * 0.4));
    b = Math.max(0, Math.round(b - warmth * 255 * 0.5));
    o[i] = r; o[i + 1] = g; o[i + 2] = b;
    o[i + 3] = d[i + 3];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vignette radial de ALPHA — fade SOMENTE nas bordas extremas
// ---------------------------------------------------------------------------
function applyRadialAlphaVignette(
  img: ImageData,
  innerRadius = 0.75,
  outerRadius = 1.05
): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / maxDist;
      let t: number;
      if (d <= innerRadius) t = 1;
      else if (d >= outerRadius) t = 0;
      else {
        const u = (d - innerRadius) / (outerRadius - innerRadius);
        t = 1 - u * u * (3 - 2 * u);
      }
      out.data[i] = data[i];
      out.data[i + 1] = data[i + 1];
      out.data[i + 2] = data[i + 2];
      out.data[i + 3] = Math.round(data[i + 3] * t);
    }
  }
  return out;
}

function applyMaskToAlpha(img: ImageData, mask: Float32Array): ImageData {
  const out = new ImageData(img.width, img.height);
  const d = img.data, o = out.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    o[i] = d[i];
    o[i + 1] = d[i + 1];
    o[i + 2] = d[i + 2];
    o[i + 3] = Math.round((d[i + 3] / 255) * mask[p] * 255);
  }
  return out;
}

function blurAlphaChannel(img: ImageData, radius = 2): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    out.data[i] = data[i];
    out.data[i + 1] = data[i + 1];
    out.data[i + 2] = data[i + 2];
  }
  const k = radius * 2 + 1;
  const area = k * k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.max(0, Math.min(h - 1, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.max(0, Math.min(w - 1, x + dx));
          s += data[(yy * w + xx) * 4 + 3];
        }
      }
      out.data[(y * w + x) * 4 + 3] = s / area;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vibrance
// ---------------------------------------------------------------------------
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
// Pipeline principal
// ---------------------------------------------------------------------------
export interface HalftoneOptions {
  targetW?: number;
  targetH?: number;
  dpi?: number;
  lpi?: number;
  angleDeg?: number;
  blackPoint?: number;
  whitePoint?: number;
  gammaLevels?: number;
  midtoneGamma?: number;
  unsharpAmount?: number;
  vibrance?: number;
  warmth?: number;
  highKeyLift?: number;
  vignetteInner?: number;
  vignetteOuter?: number;
  halftoneType?: HalftoneType;
  bgTolerance?: number;     // 0..80 — tolerância do flood fill
  featherPx?: number;       // suavização da máscara em px
}

export const DEFAULT_OPTIONS: Required<HalftoneOptions> = {
  targetW: 3307,
  targetH: 4961,
  dpi: 300,
  lpi: 35,
  angleDeg: 22,
  blackPoint: 80,
  whitePoint: 255,
  gammaLevels: 1.0,
  midtoneGamma: 0.7,
  unsharpAmount: 0.6,
  vibrance: 0.15,
  warmth: 0.08,
  highKeyLift: 0.18,
  vignetteInner: 0.78,
  vignetteOuter: 1.05,
  halftoneType: "circular",
  bgTolerance: 32,
  featherPx: 3,
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function processImage(
  source: HTMLImageElement,
  opts: HalftoneOptions = {},
  onProgress?: ProgressFn,
  previewMaxDim?: number
): Promise<Blob> {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  let tw = o.targetW, th = o.targetH;

  if (previewMaxDim) {
    const ratio = Math.min(previewMaxDim / tw, previewMaxDim / th);
    tw = Math.round(tw * ratio);
    th = Math.round(th * ratio);
  }

  onProgress?.("Redimensionando para 300 DPI", 5);
  await tick();
  const resized = resizeTo(source, tw, th);

  onProgress?.("Lendo pixels (RGBA preservado)", 12);
  await tick();
  const ctx = resized.getContext("2d")!;
  let data = ctx.getImageData(0, 0, tw, th);

  onProgress?.("Unsharp Mask", 18);
  await tick();
  data = unsharpMask(data, o.unsharpAmount, 1);

  onProgress?.("Flood fill nos cantos (preserva brancos internos)", 28);
  await tick();
  const subjectMask = floodFillBackgroundMask(data, o.bgTolerance, o.featherPx);
  // Aplica máscara já no RGBA pré-halftone para o sampling de cor não puxar do fundo
  data = applyMaskToRGBA(data, subjectMask);

  onProgress?.("Curva High-Key + warmth", 38);
  await tick();
  data = applyHighKeyWarmCurve(data, o.warmth, o.highKeyLift);

  onProgress?.("Níveis e meios-tons", 46);
  await tick();
  data = applyLevelsAndGamma(data, o.blackPoint, o.whitePoint, o.gammaLevels, o.midtoneGamma);

  const effectiveDpi = previewMaxDim ? (o.dpi * tw) / o.targetW : o.dpi;

  if (o.halftoneType === "rosette") {
    onProgress?.("Halftone Rosette CMYK (15°/75°/0°/45°)", 60);
    await tick();
    data = applyHalftoneRosette(data, effectiveDpi, o.lpi, subjectMask);
  } else {
    onProgress?.("Halftone AM circular @ ângulo", 60);
    await tick();
    data = applyHalftoneCircular(data, effectiveDpi, o.lpi, o.angleDeg, subjectMask);
  }

  onProgress?.("Vibrance", 74);
  await tick();
  data = applyVibrance(data, o.vibrance);

  onProgress?.("Reaplicando máscara de transparência", 82);
  await tick();
  data = applyMaskToAlpha(data, subjectMask);

  onProgress?.("Vignette radial → transparente (apenas borda extrema)", 88);
  await tick();
  data = applyRadialAlphaVignette(data, o.vignetteInner, o.vignetteOuter);

  onProgress?.("Suavizando bordas (alpha blur)", 92);
  await tick();
  data = blurAlphaChannel(data, 2);

  onProgress?.("Exportando PNG", 95);
  await tick();
  ctx.putImageData(data, 0, 0);
  const blob: Blob = await new Promise((res) =>
    resized.toBlob((b) => res(b!), "image/png")
  );

  onProgress?.("Inserindo metadados 300 DPI", 98);
  const finalBlob = await injectDpiPng(blob, o.dpi);
  onProgress?.("Concluído", 100);
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
