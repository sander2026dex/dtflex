// ============================================================================
// HALFTONE PIPELINE — Offset de Alta Fidelidade
// 300 DPI · 3307×4961 px · AM Halftone 35 LPI @ 22° · Pontos Circulares
// ============================================================================

export type ProgressFn = (stage: string, pct: number) => void;

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

/** Insere chunk pHYs (300 dpi = 11811 ppm) num blob PNG. */
async function injectDpiPng(blob: Blob, dpi = 300): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi * 39.3701); // pixels per meter
  const phys = new Uint8Array(21);
  // length = 9
  phys[0] = 0; phys[1] = 0; phys[2] = 0; phys[3] = 9;
  // type "pHYs"
  phys[4] = 0x70; phys[5] = 0x48; phys[6] = 0x59; phys[7] = 0x73;
  // x ppu, y ppu (big-endian uint32)
  const dv = new DataView(phys.buffer);
  dv.setUint32(8, ppm); dv.setUint32(12, ppm);
  phys[16] = 1; // unit = meters
  // CRC over type+data
  const crcInput = phys.slice(4, 17);
  dv.setUint32(17, crc32(crcInput));

  // Insere depois do IHDR (IHDR sempre começa em offset 8, comprimento 13 + 12 = 25 → próximo offset 33)
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // sig + len + type + data + crc
  const out = new Uint8Array(buf.length + phys.length);
  out.set(buf.subarray(0, ihdrEnd), 0);
  out.set(phys, ihdrEnd);
  out.set(buf.subarray(ihdrEnd), ihdrEnd + phys.length);
  return new Blob([out], { type: "image/png" });
}

// ---------------------------------------------------------------------------
// 1. Resize de alta qualidade (Lanczos via downscale em estágios + browser bicubic)
//    Para upscale grande, browser drawImage com imageSmoothingQuality "high"
// ---------------------------------------------------------------------------
function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function resizeTo(src: HTMLCanvasElement | HTMLImageElement, tw: number, th: number): HTMLCanvasElement {
  const sw = "naturalWidth" in src ? src.naturalWidth : src.width;
  const sh = "naturalHeight" in src ? src.naturalHeight : src.height;

  // Downscale em passos de 0.5 (mimetiza Lanczos para o caminho descendente)
  let curW = sw, curH = sh;
  let cur: HTMLCanvasElement | HTMLImageElement = src;
  while (curW * 0.5 > tw && curH * 0.5 > th) {
    const next = makeCanvas(Math.round(curW * 0.5), Math.round(curH * 0.5));
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, next.width, next.height);
    cur = next;
    curW = next.width; curH = next.height;
  }
  const out = makeCanvas(tw, th);
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(cur, 0, 0, tw, th);
  return out;
}

// ---------------------------------------------------------------------------
// 2. Unsharp Mask (acentua arestas antes da retícula)
// ---------------------------------------------------------------------------
function unsharpMask(img: ImageData, amount = 0.6, radius = 1): ImageData {
  const { width: w, height: h, data } = img;
  // Box blur 3x3 simples (radius 1)
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
// 3. Levels + Gamma midtones-darker
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
    // Midtones darker: gamma < 1 escurece os meios-tons
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

// ---------------------------------------------------------------------------
// 4. AM Halftone — pontos circulares rotacionados sobre fundo TRANSPARENTE
// ---------------------------------------------------------------------------
function rgbToLuma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Halftone AM circular sobre fundo TRANSPARENTE.
 * Áreas claras = sem ponto (alpha 0). Sombras = pontos densos.
 * Saída RGBA com canal alpha real (sem fundo branco).
 */
function applyHalftone(
  img: ImageData,
  dpi = 300,
  lpi = 35,
  angleDeg = 22
): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  // Inicializa fundo TRANSPARENTE (alpha = 0)
  // ImageData já vem zerado, então não precisamos preencher.

  const cellPx = dpi / lpi;
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const cosI = Math.cos(-angle), sinI = Math.sin(-angle);
  const maxR = cellPx * 0.5 * Math.SQRT2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      // Espaço da malha rotacionada
      const xr = x * cosI - y * sinI;
      const yr = x * sinI + y * cosI;
      const cxr = (Math.floor(xr / cellPx) + 0.5) * cellPx;
      const cyr = (Math.floor(yr / cellPx) + 0.5) * cellPx;
      const dxr = xr - cxr;
      const dyr = yr - cyr;
      const dist = Math.sqrt(dxr * dxr + dyr * dyr);

      // Amostra cor da célula (pixel central via rotação inversa)
      const cx = Math.round(cxr * cos - cyr * sin);
      const cy = Math.round(cxr * sin + cyr * cos);
      const sxi = Math.max(0, Math.min(w - 1, cx));
      const syi = Math.max(0, Math.min(h - 1, cy));
      const si = (syi * w + sxi) * 4;
      const luma = rgbToLuma(data[si], data[si + 1], data[si + 2]) / 255;

      // Threshold: luma ≥ 0.96 não desenha nada (fica branco puro, sem sujeira)
      if (luma >= 0.96) continue;

      // Cobertura desejada (1 = ponto cheio)
      const coverage = 1 - luma;
      const r = Math.sqrt((coverage * cellPx * cellPx) / Math.PI);

      const insideDot = dist <= r;
      const insideCorner = dist <= maxR && coverage > 0.92;
      if (insideDot || insideCorner) {
        out.data[i] = data[si];
        out.data[i + 1] = data[si + 1];
        out.data[i + 2] = data[si + 2];
        // alpha já é 255 (fundo)
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4b. Achata canal alpha contra fundo BRANCO (#FFFFFF)
// ---------------------------------------------------------------------------
function flattenOnWhite(img: ImageData): ImageData {
  const out = new ImageData(img.width, img.height);
  const d = img.data, o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    o[i] = Math.round(d[i] * a + 255 * (1 - a));
    o[i + 1] = Math.round(d[i + 1] * a + 255 * (1 - a));
    o[i + 2] = Math.round(d[i + 2] * a + 255 * (1 - a));
    o[i + 3] = 255;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4c. High-Key warm tone curve — eleva meios-tons e adiciona calor (amarelo/laranja)
// ---------------------------------------------------------------------------
function applyHighKeyWarmCurve(img: ImageData, warmth = 0.08, lift = 0.12): ImageData {
  const out = new ImageData(img.width, img.height);
  const d = img.data, o = out.data;
  // Curva de lift dos meios-tons (S invertida suave): saída = pow(in, 1/(1+lift*4))
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
    // Warm shift: aumenta R e G, reduz levemente B (puxa para amarelo/dourado)
    r = Math.min(255, Math.round(r + warmth * 255 * 0.6));
    g = Math.min(255, Math.round(g + warmth * 255 * 0.4));
    b = Math.max(0, Math.round(b - warmth * 255 * 0.5));
    o[i] = r; o[i + 1] = g; o[i + 2] = b;
    o[i + 3] = d[i + 3];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4d. Vignette radial — fade das bordas para BRANCO (papel)
// ---------------------------------------------------------------------------
function applyRadialVignetteToWhite(
  img: ImageData,
  innerRadius = 0.55,
  outerRadius = 0.95
): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  const cx = w / 2, cy = h / 2;
  // Normaliza pela diagonal/2 para alcançar cantos
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / maxDist; // 0 centro → 1 canto
      let t: number;
      if (d <= innerRadius) t = 1;
      else if (d >= outerRadius) t = 0;
      else {
        // smoothstep
        const u = (d - innerRadius) / (outerRadius - innerRadius);
        t = 1 - u * u * (3 - 2 * u);
      }
      out.data[i] = Math.round(data[i] * t + 255 * (1 - t));
      out.data[i + 1] = Math.round(data[i + 1] * t + 255 * (1 - t));
      out.data[i + 2] = Math.round(data[i + 2] * t + 255 * (1 - t));
      out.data[i + 3] = 255;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. Vibrance / Saturation boost (+15%)
// ---------------------------------------------------------------------------
function applyVibrance(img: ImageData, amount = 0.15): ImageData {
  const out = new ImageData(img.width, img.height);
  const d = img.data, o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    const sat = (max - avg) / 255; // 0..1 aprox
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
  warmth?: number;          // 0..0.3 — calor amarelo/dourado
  highKeyLift?: number;     // 0..0.4 — elevação dos meios-tons
  vignetteInner?: number;   // 0..1 — raio onde começa o fade
  vignetteOuter?: number;   // 0..1 — raio onde termina (100% branco)
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
  vignetteInner: 0.55,
  vignetteOuter: 0.95,
};

/** Yield ao event loop entre estágios pesados. */
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

  onProgress?.("Achatando sobre fundo branco", 12);
  await tick();
  const ctx = resized.getContext("2d")!;
  let data = ctx.getImageData(0, 0, tw, th);
  data = flattenOnWhite(data);

  onProgress?.("Aplicando Unsharp Mask", 22);
  await tick();
  data = unsharpMask(data, o.unsharpAmount, 1);

  onProgress?.("Curva High-Key + warmth", 32);
  await tick();
  data = applyHighKeyWarmCurve(data, o.warmth, o.highKeyLift);

  onProgress?.("Ajustando níveis e meios-tons", 42);
  await tick();
  data = applyLevelsAndGamma(data, o.blackPoint, o.whitePoint, o.gammaLevels, o.midtoneGamma);

  onProgress?.("Gerando halftone AM @ ângulo", 60);
  await tick();
  const effectiveDpi = previewMaxDim ? (o.dpi * tw) / o.targetW : o.dpi;
  data = applyHalftone(data, effectiveDpi, o.lpi, o.angleDeg);

  onProgress?.("Aplicando vibrance", 78);
  await tick();
  data = applyVibrance(data, o.vibrance);

  onProgress?.("Vignette radial → papel branco", 86);
  await tick();
  data = applyRadialVignetteToWhite(data, o.vignetteInner, o.vignetteOuter);

  onProgress?.("Exportando PNG", 92);
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
