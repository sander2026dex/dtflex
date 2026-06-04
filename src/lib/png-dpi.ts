// Re-encodes a PNG Blob inserting/replacing a pHYs chunk with the given DPI.
// 300 DPI = 11811 pixels per meter.

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

// CRC-32 (IEEE 802.3) — required by PNG chunk spec.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(view: DataView, off: number) {
  return view.getUint32(off, false);
}

function writeU32(view: DataView, off: number, val: number) {
  view.setUint32(off, val >>> 0, false);
}

function buildPhysChunk(dpi: number): Uint8Array {
  // pHYs: 9 bytes data — xPPU(4) yPPU(4) unit(1, 1=meter)
  const ppm = Math.round(dpi * 39.3701); // px per inch -> px per meter
  const data = new Uint8Array(9);
  const dv = new DataView(data.buffer);
  writeU32(dv, 0, ppm);
  writeU32(dv, 4, ppm);
  data[8] = 1;

  const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]); // "pHYs"
  const lenAndType = new Uint8Array(4 + 4 + 9);
  const lenDv = new DataView(lenAndType.buffer);
  writeU32(lenDv, 0, 9);
  lenAndType.set(type, 4);
  lenAndType.set(data, 8);

  const crcInput = lenAndType.subarray(4); // type + data
  const crc = crc32(crcInput);

  const out = new Uint8Array(4 + 4 + 9 + 4); // length + type + data + crc
  out.set(lenAndType, 0);
  const outDv = new DataView(out.buffer);
  writeU32(outDv, 4 + 4 + 9, crc);
  return out;
}

export async function setPngDpi(blob: Blob, dpi = 300): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // Validate signature
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIGNATURE[i]) return blob;

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 8;
  const chunks: Array<{ start: number; end: number; type: string }> = [];
  while (off < buf.length) {
    const length = u32(view, off);
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    const end = off + 8 + length + 4;
    chunks.push({ start: off, end, type });
    if (type === "IEND") break;
    off = end;
  }

  const newPhys = buildPhysChunk(dpi);
  const parts: Uint8Array[] = [PNG_SIGNATURE];
  let inserted = false;

  for (const c of chunks) {
    if (c.type === "pHYs") {
      // skip old pHYs
      continue;
    }
    if (!inserted && c.type !== "IHDR") {
      // pHYs must come before IDAT; insert right before the first non-IHDR chunk
      parts.push(newPhys);
      inserted = true;
    }
    parts.push(buf.subarray(c.start, c.end));
  }
  if (!inserted) {
    // edge: only IHDR present — append before end (shouldn't happen for real PNGs)
    parts.push(newPhys);
  }

  // Concat
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let cur = 0;
  for (const p of parts) {
    out.set(p, cur);
    cur += p.length;
  }
  return new Blob([out], { type: "image/png" });
}
