// ============================================================================
// HALFTONE PIPELINE — Offset de Alta Fidelidade
// 300 DPI · 3307×4961 px · AM Halftone 35 LPI · Pontos Circulares ou Rosette CMYK
// ============================================================================

export type ProgressFn = (stage: string, pct: number) => void;
export type HalftoneType = "circular" | "rosette_cmyk";

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

function analyzeMaskedLevels(img: ImageData, mask?: Float32Array) {
  const hist = new Uint32Array(256);
  const { data } = img;
  let count = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue;
    if (mask && mask[p] <= 0.08) continue;
    hist[Math.round(rgbToLuma(data[i], data[i + 1], data[i + 2]))]++;
    count++;
  }

  if (count === 0) {
    return { blackPoint: 20, whitePoint: 245 };
  }

  const percentile = (q: number) => {
    const target = count * q;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i;
    }
    return 255;
  };

  let weightedSum = 0;
  for (let i = 0; i < 256; i++) weightedSum += i * hist[i];

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let otsuThreshold = 64;

  for (let i = 0; i < 256; i++) {
    backgroundWeight += hist[i];
    if (backgroundWeight === 0) continue;

    const foregroundWeight = count - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundSum += i * hist[i];
    const meanBg = backgroundSum / backgroundWeight;
    const meanFg = (weightedSum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (meanBg - meanFg) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      otsuThreshold = i;
    }
  }

  const low = percentile(0.02);
  const high = percentile(0.985);
  const blackPoint = Math.max(0, Math.min(220, Math.round(low + Math.max(0, otsuThreshold - low) * 0.22)));
  const whitePoint = Math.max(blackPoint + 24, Math.min(255, Math.round(high)));

  return { blackPoint, whitePoint };
}

// PRÉ-IMPRESSÃO REAL: entre os pontos = TRANSPARENTE (papel = vazado)
// Não existe "papel branco" — só existe tinta ou nada.
function getPaperAlpha(_maskValue: number) {
  return 0;
}

// ---------------------------------------------------------------------------
// VALUE NOISE 2D (Perlin-like, sem dependências) — gera ruído fractal contínuo
// Usado para erodir bordas da máscara de forma orgânica/jagged ("grunge")
// ---------------------------------------------------------------------------
function makeValueNoise(seed = 1337) {
  // hash determinístico simples
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
  // fBm — soma de oitavas
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
// GRUNGE EROSION: erosiona bordas da máscara com fBm + cria zona de "aura"
// Retorna { mask, edgeFactor } onde:
//   mask: 0..1 (1 = sólido sujeito, 0 = fora)
//   edgeFactor: 0..1 (1 = núcleo do sujeito, 0 = borda dissipando — usado para encolher pontos)
// ---------------------------------------------------------------------------
function applyGrungeErosion(
  baseMask: Float32Array,
  w: number,
  h: number,
  opts: { noiseScale?: number; erosion?: number; auraWidthPx?: number; seed?: number } = {},
): { mask: Float32Array; edgeFactor: Float32Array } {
  const noiseScale = opts.noiseScale ?? 0.012; // freq do ruído
  const erosion = opts.erosion ?? 0.35;        // quanto come da borda
  const auraWidth = opts.auraWidthPx ?? 70;    // largura da zona de dissipação
  const seed = opts.seed ?? 1337;
  const noise = makeValueNoise(seed);

  // 1) Distance transform aproximado: para cada pixel, distância até a borda do sujeito
  // (dois passes Chamfer 3-4)
  const total = w * h;
  const INF = 1e9;
  const dist = new Float32Array(total);
  for (let i = 0; i < total; i++) dist[i] = baseMask[i] > 0.5 ? INF : 0;
  // forward
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
  // backward
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
  // distância em px (Chamfer 3-4 → divide por 3)
  for (let i = 0; i < total; i++) dist[i] /= 3;

  // 2) Para cada pixel, calcula:
  //    - threshold de noise local que define se pixel sobrevive (erosão jagged)
  //    - edgeFactor = como dentro está do sujeito (suavizado p/ "aura")
  const outMask = new Float32Array(total);
  const edge = new Float32Array(total);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (baseMask[i] <= 0.05) {
        outMask[i] = 0;
        edge[i] = 0;
        continue;
      }
      const d = dist[i];

      // Ruído fBm — usado para erodir a borda de forma orgânica
      const n = noise(x * noiseScale, y * noiseScale, 4, 2.1, 0.55);

      // Erosion: na zona de aura (d < auraWidth), pixel só sobrevive se ruído > threshold
      // que cresce conforme se afasta do núcleo (mais perto da borda → mais erodido)
      const auraT = Math.min(1, d / auraWidth); // 0 na borda, 1 no núcleo

      if (auraT >= 1) {
        // núcleo sólido — preservado SEMPRE (sem erosão)
        outMask[i] = 1;
        edge[i] = 1;
      } else {
        // zona de borda — erosão APENAS nos primeiros pixels da borda
        // threshold cresce rapidamente perto da borda (auraT~0) e some no núcleo
        const erodeT = 1 - auraT; // 1 na borda, 0 no núcleo
        const threshold = erodeT * erosion; // só a borda recebe ruído
        if (n < threshold) {
          outMask[i] = 0;
          edge[i] = 0;
        } else {
          // suaviza tamanho dos pontos só na borda mais externa
          const t = auraT;
          edge[i] = Math.max(0.55, t * t * (3 - 2 * t)); // não deixa ponto sumir muito
          outMask[i] = 1;
        }
      }
    }
  }
  return { mask: outMask, edgeFactor: edge };
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
// HALFTONE AM ELLIPTICAL — DTF/SILK PRINT-READY
// • Pontos ELÍPTICOS (axis ratio 0.7) — anti-bleeding em malha
// • 4 retículas combinadas em ângulos CMYK (15°/75°/0°/45°) — sem moiré
// • Dot Gain Compensation: -15% (compensa espalhamento da tinta no filme/tecido)
// • Fundo TRANSPARENTE (alpha=0) entre os pontos — PNG-32 com canal alpha
// • Faixa tonal: 2% (highlights) → 98% (shadows)
// ---------------------------------------------------------------------------
function applyHalftoneCircular(
  img: ImageData,
  dpi = 300,
  lpi = 65,
  _angleDeg = 22,
  mask?: Float32Array,
  edgeFactor?: Float32Array,
): ImageData {
  const { width: w, height: h, data } = img;
  const out = new ImageData(w, h);
  // Fundo TRANSPARENTE (alpha = 0)
  const od = out.data;

  const cellPx = dpi / lpi;
  const cellArea = cellPx * cellPx;

  // Axis ratio 0.7 (eixo curto / eixo longo) → aspect = 1/0.7 ≈ 1.428
  // Elíptico clássico de pré-impressão para malha — evita ink bleeding
  const ellipseAspect = 1 / 0.7;

  // Ângulos CMYK clássicos (4 chapas), em radianos
  // C 15°, M 75°, Y 0°, K 45° — padrão ISO offset/silk
  const SCREEN_ANGLES = [15, 75, 0, 45].map((d) => (d * Math.PI) / 180);

  // Faixa tonal: 2% → 98% (preserva luzes sutis e sombras profundas)
  const COVER_MIN = 0.02;
  const COVER_MAX = 0.98;
  // Dot Gain Compensation: reduz raio efetivo em 15%
  const DOT_GAIN_COMP = 0.85;

  // Pré-computa cossenos/senos por ângulo
  const angCos = SCREEN_ANGLES.map((a) => Math.cos(a));
  const angSin = SCREEN_ANGLES.map((a) => Math.sin(a));
  const angCosI = SCREEN_ANGLES.map((a) => Math.cos(-a));
  const angSinI = SCREEN_ANGLES.map((a) => Math.sin(-a));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const pi = y * w + x;
      const pixelMask = mask ? mask[pi] : 1;
      if (pixelMask <= 0.01) continue; // fora do sujeito → transparente

      const cellEdge = edgeFactor ? edgeFactor[pi] : 1;

      // Amostra cor diretamente do pixel atual — preserva fidelidade do detalhe
      const rPix = data[i], gPix = data[i + 1], bPix = data[i + 2];
      const luma = rgbToLuma(rPix, gPix, bPix) / 255;
      const density = 1 - luma;
      let coverage = (COVER_MIN + (COVER_MAX - COVER_MIN) * density) * pixelMask;
      if (coverage <= 0.015) continue;
      coverage *= cellEdge;
      if (coverage <= 0.005) continue;

      // Dot Gain Compensation: reduz o raio em 15%
      const baseR = Math.sqrt((coverage * cellArea) / Math.PI) * DOT_GAIN_COMP;
      const ra = baseR * Math.sqrt(ellipseAspect);
      const rb = baseR / Math.sqrt(ellipseAspect);

      // Testa as 4 retículas em ângulos CMYK — pixel é "tinta" se cair em qualquer ponto
      let bestSoft = 0;
      for (let s = 0; s < 4; s++) {
        const xr = x * angCosI[s] - y * angSinI[s];
        const yr = x * angSinI[s] + y * angCosI[s];
        const cxr = (Math.floor(xr / cellPx) + 0.5) * cellPx;
        const cyr = (Math.floor(yr / cellPx) + 0.5) * cellPx;
        const dxr = xr - cxr;
        const dyr = yr - cyr;
        const ex = dxr / ra;
        const ey = dyr / rb;
        const eDist = ex * ex + ey * ey;
        if (eDist > 1) continue;
        const softEdge = eDist > 0.81 ? Math.max(0, 1 - (eDist - 0.81) / 0.19) : 1;
        if (softEdge > bestSoft) bestSoft = softEdge;
        if (bestSoft >= 0.999) break;
      }
      if (bestSoft <= 0.02) continue;

      const edgeAlpha = Math.min(1, cellEdge * 1.1);
      const alpha = Math.round(255 * edgeAlpha * bestSoft);
      if (alpha <= 4) continue;

      od[i]     = rPix;
      od[i + 1] = gPix;
      od[i + 2] = bPix;
      od[i + 3] = alpha;
      // Suprime warning de variáveis não usadas mantidas para compat de assinatura
      void angCos; void angSin;
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
  const cs = Math.cos(angle), ss = Math.sin(angle);
  const cosI = Math.cos(-angle), sinI = Math.sin(-angle);
  const maxR = cellPx * 0.5 * Math.SQRT2;
  const maxRSq = maxR * maxR;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xr = x * cosI - y * sinI;
      const yr = x * sinI + y * cosI;
      const cxr = (Math.floor(xr / cellPx) + 0.5) * cellPx;
      const cyr = (Math.floor(yr / cellPx) + 0.5) * cellPx;
      const dxr = xr - cxr;
      const dyr = yr - cyr;
      const distSq = dxr * dxr + dyr * dyr;
      // amostra cobertura no centro da célula (rotação inversa de volta)
      const sx = Math.round(cxr * cs - cyr * ss);
      const sy = Math.round(cxr * ss + cyr * cs);
      const sxi = Math.max(0, Math.min(w - 1, sx));
      const syi = Math.max(0, Math.min(h - 1, sy));
      const cellMask = mask ? mask[syi * w + sxi] : 1;
      if (cellMask <= 0.01) continue;
      const coverage = channel[syi * w + sxi] * cellMask;
      if (coverage <= 0.01) continue;
      const r = Math.sqrt((coverage * cellPx * cellPx) / Math.PI);
      const rSq = r * r;
      if (distSq <= rSq || (distSq <= maxRSq && coverage > 0.95)) {
        dots[y * w + x] = 1;
      }
    }
  }
  return dots;
}

// ---------------------------------------------------------------------------
// HALFTONE ROSETTE CMYK — RETÍCULA REAL DE PRÉ-IMPRESSÃO
// • 4 chapas: C 15° · M 75° · Y 0° · K 45° → padrão floral (rosette)
// • Cada ponto = TINTA SÓLIDA da chapa (Cyan, Magenta, Yellow, Black)
// • Preto = ponto K SÓLIDO (mas é a chapa K, não fundo)
// • Entre os pontos = TRANSPARENTE (papel vazado)
// • Sobreposição de tintas = multiply real
// ---------------------------------------------------------------------------
function applyHalftoneRosette(
  img: ImageData,
  dpi = 300,
  lpi = 35,
  mask?: Float32Array
): ImageData {
  const { width: w, height: h, data } = img;
  const total = w * h;
  const cellPx = dpi / lpi;

  // Separação CMYK real
  const C = new Float32Array(total);
  const M = new Float32Array(total);
  const Y = new Float32Array(total);
  const K = new Float32Array(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const [c, m, y, k] = rgbToCmyk(data[i], data[i + 1], data[i + 2]);
    C[p] = c; M[p] = m; Y[p] = y; K[p] = k;
  }

  // Halftone por chapa nos ângulos clássicos offset
  const dotsC = halftoneChannel(C, w, h, cellPx, 15, mask);
  const dotsM = halftoneChannel(M, w, h, cellPx, 75, mask);
  const dotsY = halftoneChannel(Y, w, h, cellPx, 0,  mask);
  const dotsK = halftoneChannel(K, w, h, cellPx, 45, mask);

  // Cores das tintas (process inks)
  const INK_C = { r: 0,   g: 174, b: 239 };
  const INK_M = { r: 236, g: 0,   b: 140 };
  const INK_Y = { r: 255, g: 237, b: 0   };
  const INK_K = { r: 20,  g: 20,  b: 20  };

  const out = new ImageData(w, h);
  const o = out.data;
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const mk = mask ? mask[p] : 1;
    if (mk <= 0.01) continue;

    const hC = !!dotsC[p];
    const hM = !!dotsM[p];
    const hY = !!dotsY[p];
    const hK = !!dotsK[p];
    if (!hC && !hM && !hY && !hK) continue; // sem tinta = vazado

    // Multiply das tintas presentes (sobre branco virtual = 1,1,1)
    let r = 1, g = 1, b = 1;
    if (hC) { r *= INK_C.r / 255; g *= INK_C.g / 255; b *= INK_C.b / 255; }
    if (hM) { r *= INK_M.r / 255; g *= INK_M.g / 255; b *= INK_M.b / 255; }
    if (hY) { r *= INK_Y.r / 255; g *= INK_Y.g / 255; b *= INK_Y.b / 255; }
    if (hK) { r *= INK_K.r / 255; g *= INK_K.g / 255; b *= INK_K.b / 255; }

    o[i]     = Math.round(r * 255);
    o[i + 1] = Math.round(g * 255);
    o[i + 2] = Math.round(b * 255);
    o[i + 3] = 255; // ponto sólido
  }
  return out;
}

// ---------------------------------------------------------------------------
// WARM COLOR GRADING — paleta Jack Sparrow (sem preto, só marrom→laranja→amarelo→branco)
// Mapeia luminância para gradiente quente: shadows=marrom escuro, mids=laranja, highs=branco
// ---------------------------------------------------------------------------
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

interface RGB { r: number; g: number; b: number; }
const WARM_STOPS: { t: number; c: RGB }[] = [
  { t: 0.00, c: { r: 60,  g: 28,  b: 12  } },   // sombra profunda — marrom escuro (NÃO preto)
  { t: 0.18, c: { r: 110, g: 50,  b: 18  } },   // marrom queimado
  { t: 0.38, c: { r: 178, g: 78,  b: 22  } },   // laranja terra
  { t: 0.58, c: { r: 232, g: 130, b: 38  } },   // laranja vibrante
  { t: 0.78, c: { r: 250, g: 195, b: 95  } },   // dourado/amarelo
  { t: 1.00, c: { r: 255, g: 245, b: 215 } },   // luz alta — branco quente
];

function sampleWarmGradient(t: number): RGB {
  if (t <= 0) return WARM_STOPS[0].c;
  if (t >= 1) return WARM_STOPS[WARM_STOPS.length - 1].c;
  for (let i = 0; i < WARM_STOPS.length - 1; i++) {
    const a = WARM_STOPS[i], b = WARM_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / (b.t - a.t);
      return { r: lerp(a.c.r, b.c.r, u), g: lerp(a.c.g, b.c.g, u), b: lerp(a.c.b, b.c.b, u) };
    }
  }
  return WARM_STOPS[WARM_STOPS.length - 1].c;
}

function applyWarmGrading(img: ImageData, intensity = 1): ImageData {
  const out = new ImageData(img.width, img.height);
  const d = img.data, o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = rgbToLuma(d[i], d[i + 1], d[i + 2]) / 255;
    const warm = sampleWarmGradient(luma);
    o[i]     = Math.round(lerp(d[i],     warm.r, intensity));
    o[i + 1] = Math.round(lerp(d[i + 1], warm.g, intensity));
    o[i + 2] = Math.round(lerp(d[i + 2], warm.b, intensity));
    o[i + 3] = d[i + 3];
  }
  return out;
}

// ---------------------------------------------------------------------------
// HALFTONE WARM DUOTONE — só Magenta + Yellow (zero Cyan, zero Black)
// Resultado parece impresso só com tintas quentes
// ---------------------------------------------------------------------------
function applyHalftoneWarmDuotone(
  img: ImageData,
  dpi = 300,
  lpi = 35,
  mask?: Float32Array
): ImageData {
  const { width: w, height: h, data } = img;
  const total = w * h;
  const cellPx = dpi / lpi;

  // Decompõe em "tinta magenta" e "tinta amarela" a partir do RGB já gradiado
  const Mch = new Float32Array(total);
  const Ych = new Float32Array(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    // Yellow ink absorve azul → cobertura ~ (1 - b)
    Ych[p] = Math.max(0, Math.min(1, 1 - b));
    // Magenta ink absorve verde → cobertura ~ (1 - g), mas descontada do amarelo já presente
    Mch[p] = Math.max(0, Math.min(1, (1 - g) - 0.15 * Ych[p]));
  }

  // Ângulos clássicos quentes — Y 0°, M 75° (sem C nem K)
  const dotsY = halftoneChannel(Ych, w, h, cellPx, 0, mask);
  const dotsM = halftoneChannel(Mch, w, h, cellPx, 75, mask);

  // Tintas em RGB (offset quente — sem papel, fundo vazado)
  const INK_M = { r: 226, g: 56,  b: 92  };  // magenta levemente quente
  const INK_Y = { r: 248, g: 200, b: 60  };  // amarelo dourado


  const out = new ImageData(w, h);
  const o = out.data;
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const mk = mask ? mask[p] : 1;
    if (mk <= 0.005) continue;

    const hY = !!dotsY[p];
    const hM = !!dotsM[p];
    if (!hY && !hM) continue; // sem tinta = vazado (transparente)

    // Multiply das tintas presentes (sem branco de papel — fica vazado entre os pontos)
    let r = 1, g = 1, b = 1;
    if (hY) { r *= INK_Y.r / 255; g *= INK_Y.g / 255; b *= INK_Y.b / 255; }
    if (hM) { r *= INK_M.r / 255; g *= INK_M.g / 255; b *= INK_M.b / 255; }

    o[i]     = Math.round(r * 255);
    o[i + 1] = Math.round(g * 255);
    o[i + 2] = Math.round(b * 255);
    o[i + 3] = 255; // ponto de tinta sólido
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
  bgTolerance?: number;
  featherPx?: number;
  // Grunge splatter
  grungeErosion?: number;   // 0..1 — quanto come da borda
  grungeAuraPx?: number;    // largura da zona de dissipação (px @ saída)
  grungeNoiseScale?: number;
  grungeSeed?: number;
}

export const DEFAULT_OPTIONS: Required<HalftoneOptions> = {
  targetW: 3307,
  targetH: 4930,
  dpi: 300,
  // LPI ALTO = retícula fina como na referência (pontos pequenos, alta densidade)
  lpi: 85,
  angleDeg: 22,
  // Curva SUAVE — preserva range tonal completo (não esmaga shadows nem highlights)
  blackPoint: 0,
  whitePoint: 255,
  gammaLevels: 1.0,
  // Midtone leve para dar corpo sem perder detalhe (1.1x → 1/1.1 ≈ 0.91)
  midtoneGamma: 0.91,
  // Sharpen leve — realça detalhe sem criar artefato
  unsharpAmount: 0.55,
  // Saturação leve — cor natural, não saturada artificial
  vibrance: 0.10,
  warmth: 0.0,
  highKeyLift: 0.0,
  vignetteInner: 1.0,
  vignetteOuter: 1.2,
  halftoneType: "circular",
  bgTolerance: 38,
  featherPx: 4,
  grungeErosion: 0.10,
  grungeAuraPx: 35,
  grungeNoiseScale: 0.014,
  grungeSeed: 1337,
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

  onProgress?.("Resize Lanczos", 5);
  await tick();
  const resized = resizeTo(source, tw, th);

  onProgress?.("Lendo pixels", 12);
  await tick();
  const ctx = resized.getContext("2d")!;
  let data = ctx.getImageData(0, 0, tw, th);

  onProgress?.("Unsharp Mask", 18);
  await tick();
  data = unsharpMask(data, o.unsharpAmount, 1);

  onProgress?.("Detectando sujeito (flood fill)", 26);
  await tick();
  const baseMask = floodFillBackgroundMask(data, o.bgTolerance, o.featherPx);

  onProgress?.("Erosão grunge + aura splatter", 36);
  await tick();
  const scale = tw / o.targetW;
  const { mask: subjectMask, edgeFactor } = applyGrungeErosion(baseMask, tw, th, {
    noiseScale: o.grungeNoiseScale / Math.max(0.01, scale),
    erosion: o.grungeErosion,
    auraWidthPx: o.grungeAuraPx * scale,
    seed: o.grungeSeed,
  });

  // Color sampling acontece sobre data ORIGINAL (não mascarado) — cores vibrantes preservadas
  onProgress?.("Curva High-Key", 44);
  await tick();
  data = applyHighKeyWarmCurve(data, o.warmth, o.highKeyLift);

  onProgress?.("Black point + níveis", 50);
  await tick();
  const autoLevels = analyzeMaskedLevels(data, baseMask);
  const effectiveBlackPoint = o.blackPoint > 0 ? o.blackPoint : autoLevels.blackPoint;
  const effectiveWhitePoint = Math.max(effectiveBlackPoint + 24, Math.min(255, o.whitePoint > 0 ? o.whitePoint : autoLevels.whitePoint));
  data = applyLevelsAndGamma(data, effectiveBlackPoint, effectiveWhitePoint, o.gammaLevels, o.midtoneGamma);

  // Boost saturação ANTES do halftone — cores chegam vivas aos pontos
  onProgress?.("Vibrance pre-halftone", 56);
  await tick();
  data = applyVibrance(data, o.vibrance);

  const effectiveDpi = previewMaxDim ? (o.dpi * tw) / o.targetW : o.dpi;

  onProgress?.(`Halftone elíptico AM @ ${o.lpi} LPI`, 65);
  await tick();
  if (o.halftoneType === "rosette_cmyk") {
    data = applyHalftoneRosette(data, effectiveDpi, o.lpi, subjectMask);
  } else {
    data = applyHalftoneCircular(data, effectiveDpi, o.lpi, o.angleDeg, subjectMask, edgeFactor);
  }

  // Vignette opcional — só roda se inner < 1 (fade extra para "papel")
  if (o.vignetteInner < 1) {
    onProgress?.("Vignette radial (fade adicional)", 88);
    await tick();
    data = applyRadialAlphaVignette(data, o.vignetteInner, o.vignetteOuter);
  }

  onProgress?.("Exportando PNG-32 (RGBA)", 95);
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
