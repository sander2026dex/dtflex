/**
 * DTFLEXPRO INDUSTRIAL RIP ENGINE v4.0.0
 * Specialized Dual-Motor Processing for Industrial DTF/Silk Screening.
 */

import { RipSettings } from '../types';

const ENGINE_VERSION = "4.0.0";

self.onmessage = function (e: MessageEvent) {
  const { type, imageData, settings, bgAnchorColors } = e.data;

  if (type === 'process' && imageData && settings) {
    const processedData = processImage(imageData, settings, bgAnchorColors);
    self.postMessage({ type: 'result', imageData: processedData });
  }
};

function processImage(imageData: ImageData, settings: RipSettings, bgAnchorColors?: {r: number, g: number, b: number}[]): ImageData {
  const { width, height, data } = imageData;
  const output = new ImageData(new Uint8ClampedArray(data.length), width, height);
  const outData = output.data;
  const bgColors = bgAnchorColors || [];

  // 1. AUTOMATIC CONTEXT DETECTION
  // If we found a dark background to remove, we enter "Dark Garment" mode (Knockout Black).
  // Otherwise, we default to "Light/Universal" mode (Print everything).
  let isBlackShirt = false;
  
  if (settings.removeBackground) {
    // Check if bg colors are primarily dark
    const darkBg = bgColors.some(c => (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) < 60);
    if (darkBg) isBlackShirt = true;
  }

  // 2. INTELLIMASK PRO: ADVANCED SUBJECT & SKIN ANALYSIS
  const protectionMask = new Uint8Array(width * height);
  const featureMask = new Uint8Array(width * height); // High Priority Detail Map
  const bgMask = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      
      const distToWhiteSq = (255-r)**2 + (255-g)**2 + (255-b)**2;
      
      // Smart BG Detection: Extremely conservative to preserve glows and fires
      // If smartWhite is enabled, we are even MORE conservative with white bg removal
      // User requested NOT TO REMOVE WHITE, so we set a very low threshold for it
      let bgThresh = settings.removeBackground ? (isBlackShirt ? 400 : (settings.smartWhite ? 4 : 300)) : 40;
      let isBg = distToWhiteSq < bgThresh;
      
      // If Smart White is on, any color near white IS NOT background
      if (settings.smartWhite && distToWhiteSq < 2200) isBg = false;
      
      if (settings.removeBackground && !isBg) {
        for (const bg of bgColors) {
          const dR = r - bg.r, dG = g - bg.g, dB = b - bg.b;
          // Dynamically adjust tolerance based on whether it's white bg
          const isWhiteBg = bg.r > 240 && bg.g > 240 && bg.b > 240;
          const toleranceSq = (isWhiteBg && settings.smartWhite) ? 16 : 800;
          if (dR*dR + dG*dG + dB*dB < toleranceSq) { isBg = true; break; }
        }
      }
      if (isBg) bgMask[y * width + x] = 1;

      // Professional Feature Analysis: Protect white highlights, structural whites, and glows
      const isSkin = (r > 45 && g > 25 && b > 10 && r > g && (g - b) > 1);
      const isPureWhite = distToWhiteSq < (settings.smartWhite ? 2000 : 500); 
      const isGlow = (r > 120 && g > 100) || (r > 100 && g > 100 && b < 100); 
      const isDarkFeature = (r < 105 && g < 105 && b < 105) && !isBg; 
      // Detect vivid elements (logos, accessories, text)
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b), sat = maxC > 0 ? (maxC-minC)/maxC : 0;
      const isVivid = sat > 0.18 && maxC > 15;

      let isStructure = false;
      if (y > 0 && x > 0 && y < height - 1 && x < width - 1) {
        const up = idx - width * 4, down = idx + width * 4, left = idx - 4, right = idx + 4;
        const contrast = Math.max(
          Math.abs(r - data[up]) + Math.abs(g - data[up+1]) + Math.abs(b - data[up+2]),
          Math.abs(r - data[down]) + Math.abs(g - data[down+1]) + Math.abs(b - data[down+2]),
          Math.abs(r - data[left]) + Math.abs(g - data[left+1]) + Math.abs(b - data[left+2]),
          Math.abs(r - data[right]) + Math.abs(g - data[right+1]) + Math.abs(b - data[right+2])
        );
        if (contrast > 10) isStructure = true; 
      }

      if ((isSkin || isDarkFeature || isVivid || isStructure || isPureWhite || isGlow) && !isBg) {
        protectionMask[y * width + x] = 1;
        if (isDarkFeature || isStructure || isVivid || isPureWhite || isGlow) {
          featureMask[y * width + x] = 1; 
        }
      }
    }
  }

  // SMART CHOKE: Dramatically simplified to prevent "Swiss Cheese" holes
  if (settings.removeBackground) {
    const tempBg = new Uint8Array(bgMask);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (bgMask[y * width + x] === 1) continue;
        let bgNeighbors = 0;
        if (bgMask[((y - 1) * width + x)] === 1) bgNeighbors++;
        if (bgMask[((y + 1) * width + x)] === 1) bgNeighbors++;
        if (bgMask[(y * width + (x - 1))] === 1) bgNeighbors++;
        if (bgMask[(y * width + (x + 1))] === 1) bgNeighbors++;
        
        // Only choke if almost entirely surrounded by background AND very close to white
        // If smartWhite is enabled, we NEVER choke unless it's absolute background.
        if (bgNeighbors >= 4 && !settings.smartWhite) {
          const idx = (y * width + x) * 4;
          const distWHsq = (255 - data[idx])**2 + (255 - data[idx+1])**2 + (255 - data[idx+2])**2;
          if (distWHsq < 600) tempBg[y * width + x] = 1; 
        }
      }
    }
    bgMask.set(tempBg);
  }

  // 2. ENGINE PARAMETERS CONFIGURATION: DUAL-MOTOR SYSTEM
  const DARK_ENGINE = {
    lpi: Math.max(45, settings.lpi || 50),
    contrast: (settings.contrast + 135) / 100,
    power: 1.05 - (settings.dotGain / 200),
    saturation: 1.05, 
    sharpness: (settings.sharpness || 0) / 8.5,
    softness: Math.max(0.001, settings.softEdge / 600),
    minDot: 0, 
    cleaning: 0 
  };

  const LIGHT_ENGINE = {
    lpi: Math.min(35, settings.lpi || 32),
    contrast: (settings.contrast + 102) / 100,
    power: 1.05 - (settings.dotGain / 600), 
    saturation: 1.0, 
    sharpness: (settings.sharpness || 0) / 18,
    softness: Math.max(0.01, settings.softEdge / 200), 
    minDot: 0,
    cleaning: 0 
  };

  const engine = isBlackShirt ? DARK_ENGINE : LIGHT_ENGINE;

  const angleRad = (settings.angle || 22) * (Math.PI / 180);
  const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
  const dotScale = 300 / engine.lpi, invDotScale = 1.0 / dotScale;

  const targetToleranceSq = Math.pow((settings.targetColorTolerance || 20) * 3.8, 2);
  const targetIntensity = (settings.targetColorIntensity || 50) / 100;
  const getIdx = (x: number, y: number) => (Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4;

  function localSmoothstep(n1: number, n2: number, v: number) { 
    const x = Math.max(0, Math.min(1, (v - n1) / (n2 - n1))); 
    return x * x * (3 - 2 * x); 
  }

  // 3. MAIN PROCESSING LOOP
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let a = data[idx + 3];
      if ((settings.removeBackground && bgMask[y * width + x] === 1) || a < 5) {
        outData[idx+3] = 0; continue;
      }

      let r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const isProtected = protectionMask[y * width + x] === 1;
      const isFeature = featureMask[y * width + x] === 1;

      // Selective Sharpening
      if (engine.sharpness > 0 || isFeature) {
        const amt = isFeature ? engine.sharpness * 1.5 + 0.1 : engine.sharpness;
        const up = getIdx(x, y - 1), down = getIdx(x, y + 1), left = getIdx(x - 1, y), right = getIdx(x + 1, y);
        r += (r * 4 - data[up] - data[down] - data[left] - data[right]) * amt;
        g += (g * 4 - data[up + 1] - data[down + 1] - data[left + 1] - data[right + 1]) * amt;
        b += (b * 4 - data[up + 2] - data[down + 2] - data[left + 2] - data[right + 2]) * amt;
      }

      // Target Spot Color Recovery
      let targetWeight = 0, isTargeted = false;
      if (settings.targetColors && settings.targetColors.length > 0) {
        for (const tc of settings.targetColors) {
          const dR = r - tc.r, dG = g - tc.g, dB = b - tc.b, dSq = dR*dR + dG*dG + dB*dB;
          if (dSq < targetToleranceSq) {
            isTargeted = true;
            const d = Math.sqrt(dSq), tol = Math.sqrt(targetToleranceSq);
            targetWeight = Math.max(targetWeight, localSmoothstep(tol, tol * 0.1, d));
          }
        }
      }

      // Color Recovery & Vibrance
      if (engine.saturation > 1.0) {
        const avg = (r + g + b) / 3;
        r = Math.min(255, avg + (r - avg) * engine.saturation);
        g = Math.min(255, avg + (g - avg) * engine.saturation);
        b = Math.min(255, avg + (b - avg) * engine.saturation);
      }

      // Final Contrast & Detail Preservation
      const c = isFeature ? engine.contrast * 1.15 : (isProtected ? engine.contrast * 0.9 : engine.contrast);
      r = Math.min(255, Math.max(0, ((r/255-0.5)*c + 0.5)*255));
      g = Math.min(255, Math.max(0, ((g/255-0.5)*c + 0.5)*255));
      b = Math.min(255, Math.max(0, ((b/255-0.5)*c + 0.5)*255));

      const gray = (0.299 * r + 0.587 * g + 0.114 * b);
      const distWHsq = (255-r)**2 + (255-g)**2 + (255-b)**2;
      
      // UNIVERSAL ENGINE LOGIC:
      // If we are NOT on a black shirt, we halftone to define shape.
      // We ensure dark areas (including black) are heavily dots, and white areas are transition.
      let luminance = 0;
      if (isBlackShirt) {
        luminance = gray / 255;
      } else {
        // Light/Colored Garment logic: Invert for print.
        // But we add a "Floor" to prevent holes in low-density areas.
        luminance = (255 - gray) / 255;
        
        if (settings.smartWhite && distWHsq < 2200) {
           luminance = Math.max(0.38, luminance); // Stronger reticulation base for white
           a = 255; // Force solid opacity for white areas to prevent any removal
        } else if (luminance > 0 && luminance < 0.1) {
           luminance = 0.08 + luminance * 0.8; // Prevent small holes in highlights
        }
      }

      // Underbase & Highlighting
      if (!isBlackShirt) {
        // LIGHT/COLORED ENGINE: Better transition for light tones to prevent 'buracos'
        if (luminance < 0.35 && !settings.smartWhite) {
          luminance = 0.08 + luminance * 1.3; // Boost light dots to fill holes
        }
        if (isProtected && luminance < 0.5) luminance *= 1.25;
        if (isFeature) luminance = Math.min(0.95, luminance * 1.5);
      } else {
        // DARK ENGINE: Ensure white ink is prioritized in light areas
        if (isFeature) luminance = Math.min(1.0, luminance * 1.25);
        if (luminance > 0 && luminance < 0.1) luminance = 0.06 + luminance * 1.8;
      }

      if (settings.halftoneEnabled) {
        let threshold = Math.pow(luminance, engine.power);
        if (isTargeted) {
          threshold = Math.min(1.0, threshold + (1.0 - threshold) * targetIntensity * targetWeight);
          a = Math.min(255, a + (255 - a) * targetWeight);
        }

        const edge = engine.softness + (isProtected ? 0.06 : 0);
        let totalVal = 0;
        const rotX = x * cosA - y * sinA, rotY = x * sinA + y * cosA;
        // 12x Industrial Supersampling for Professional Edges
        const sub = [
          [-0.3, -0.1], [0.3, -0.1], [-0.3, 0.1], [0.3, 0.1],
          [-0.1, -0.3], [0.1, -0.3], [-0.1, 0.3], [0.1, 0.3],
          [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]
        ];
        for (let s = 0; s < 12; s++) {
          const sx = rotX + (sub[s][0]*cosA - sub[s][1]*sinA);
          const sy = rotY + (sub[s][0]*sinA + sub[s][1]*cosA);
          const cx = (((sx * invDotScale) % 1) + 1) % 1, cy = (((sy * invDotScale) % 1) + 1) % 1;
          const spot = (Math.cos(Math.PI * (cx - 0.5) * 2) + Math.cos(Math.PI * (cy - 0.5) * 2)) / 4 + 0.5;
          const v = (spot - (1.0 - threshold - edge)) / (edge * 2);
          if (v >= 1) totalVal += 1; else if (v > 0) totalVal += localSmoothstep(0, 1, v);
        }

        const alphaResult = (a / 255) * (totalVal / 12);
        const finalAlpha = alphaResult < engine.minDot ? 0 : (alphaResult > 0.98 ? 255 : Math.round(alphaResult * 255));
        
        outData[idx] = r; outData[idx+1] = g; outData[idx+2] = b; outData[idx+3] = finalAlpha;
      } else {
        outData[idx] = r; outData[idx+1] = g; outData[idx+2] = b; outData[idx+3] = a;
      }
    }
  }


  // 4. POST-PROCESSING: UNIVERSAL AUTO-HOLE PROTECTION
  const cleaned = new Uint8ClampedArray(outData);
  const holeThreshold = 140; // Higher threshold for hole detection
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const alpha = outData[idx + 3];
      const origAlpha = data[idx + 3];

      // UNIVERSAL PROTECTION: If it was solid in original, but now it's a "hole"
      if (origAlpha > 180 && alpha < holeThreshold) {
        let solidNeighbors = 0;
        let avgR = 0, avgG = 0, avgB = 0;
        let neighborAlphaSum = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            const nAlpha = outData[nIdx + 3];
            neighborAlphaSum += nAlpha;
            if (nAlpha > 100) {
              solidNeighbors++;
              avgR += outData[nIdx]; 
              avgG += outData[nIdx+1]; 
              avgB += outData[nIdx+2];
            }
          }
        }
        
        const isProtected = protectionMask[y * width + x] === 1;
        const avgNeighborAlpha = neighborAlphaSum / 8;
        
        // Even more aggressive filling for white areas
        const isWhiteArea = (255-data[idx])**2 + (255-data[idx+1])**2 + (255-data[idx+2])**2 < 2500;
        
        if (solidNeighbors >= 2 || avgNeighborAlpha > 150 || (isProtected && solidNeighbors >= 1) || isWhiteArea) {
          cleaned[idx] = solidNeighbors > 0 ? avgR / solidNeighbors : data[idx]; 
          cleaned[idx+1] = solidNeighbors > 0 ? avgG / solidNeighbors : data[idx+1];
          cleaned[idx+2] = solidNeighbors > 0 ? avgB / solidNeighbors : data[idx+2];
          
          cleaned[idx+3] = isWhiteArea ? 255 : Math.max(alpha, Math.min(255, avgNeighborAlpha * 1.2));
        }
      } 
      // Detect "Noise" (Isolated dots in transparent areas)
      else if (alpha > 0 && alpha < 100) {
        if (featureMask[y * width + x] === 1) continue; // Protect features
        
        let neighborCount = 0;
        const neighbors = [
          ((y-1)*width + x)*4 + 3,
          ((y+1)*width + x)*4 + 3,
          (y*width + (x-1))*4 + 3,
          (y*width + (x+1))*4 + 3
        ];
        for (const n of neighbors) {
          if (outData[n] > 10) neighborCount++;
        }
        if (neighborCount === 0) cleaned[idx+3] = 0; // Remove isolated dust
      }
    }
  }
  
  output.data.set(cleaned);
  return output;
}

