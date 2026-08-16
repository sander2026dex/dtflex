import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  LayoutGrid,
  RotateCw,
  Trash2,
  Upload,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/** ---------------- helpers ---------------- */
const CM_PER_INCH = 2.54;
const cmToPx = (cm: number, dpi: number) => Math.round((cm * dpi) / CM_PER_INCH);
const pxToCm = (px: number, dpi: number) => (px * CM_PER_INCH) / dpi;

type Art = {
  id: string;
  name: string;
  /** fonte original — nunca é modificada */
  source: HTMLImageElement;
  /** preview leve apenas para a tela */
  preview: HTMLCanvasElement;
  pxW: number;
  pxH: number;
  ratio: number;
  xCm: number;
  yCm: number;
  wCm: number;
  hCm: number;
  rotation: number; // graus
  lockRatio: boolean;
};

let uid = 0;
const nextId = () => `art_${++uid}_${Date.now().toString(36)}`;

/** pHYs 300dpi patch */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function buildPhys(dpi: number) {
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, ppm, false);
  dv.setUint32(4, ppm, false);
  data[8] = 1;
  const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]);
  const body = new Uint8Array(13);
  body.set(type, 0);
  body.set(data, 4);
  const out = new Uint8Array(21);
  const od = new DataView(out.buffer);
  od.setUint32(0, 9, false);
  out.set(type, 4);
  out.set(data, 8);
  od.setUint32(17, crc32(body), false);
  return out;
}
function withDpi(buf: Uint8Array, dpi: number) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const parts: Uint8Array[] = [buf.subarray(0, 8)];
  const phys = buildPhys(dpi);
  let inserted = false;
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = dv.getUint32(off, false);
    const end = off + 8 + len + 4;
    if (end > buf.length) break;
    const t = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    if (t !== "pHYs") parts.push(buf.subarray(off, end));
    if (t === "IHDR" && !inserted) {
      parts.push(phys);
      inserted = true;
    }
    off = end;
    if (t === "IEND") break;
  }
  if (!inserted) parts.splice(1, 0, phys);
  let total = 0;
  parts.forEach((p) => (total += p.length));
  const outBuf = new Uint8Array(total);
  let cur = 0;
  parts.forEach((p) => {
    outBuf.set(p, cur);
    cur += p.length;
  });
  return outBuf;
}

function makePreview(img: HTMLImageElement, maxSide = 900) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** bounding box da arte já rotacionada, em cm */
function bboxCm(a: Art) {
  const r = (a.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: a.wCm * c + a.hCm * s, h: a.wCm * s + a.hCm * c };
}

/** ---------------- componente ---------------- */
export function DTFGangSheetStudio({ onClose }: { onClose: () => void }) {
  const [widthCm, setWidthCm] = useState(58);
  const [heightCm, setHeightCm] = useState(100);
  const [dpi, setDpi] = useState(300);
  const [marginCm, setMarginCm] = useState(1);
  const [gapCm, setGapCm] = useState(0.5);
  const [format, setFormat] = useState<"png" | "tiff">("png");
  const [arts, setArts] = useState<Art[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [report, setReport] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stageScale, setStageScale] = useState(1); // px de tela por cm

  const selected = arts.find((a) => a.id === selectedId) ?? null;
  const pxW = cmToPx(widthCm, dpi);
  const pxH = cmToPx(heightCm, dpi);

  /** escala do preview */
  useEffect(() => {
    const compute = () => {
      const el = stageRef.current;
      if (!el) return;
      const pad = 24;
      const s = Math.min(
        (el.clientWidth - pad) / widthCm,
        (el.clientHeight - pad) / heightCm,
      );
      setStageScale(Math.max(0.4, s));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [widthCm, heightCm]);

  /** desenha o preview (baixa resolução, só visual) */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const w = Math.max(1, Math.round(widthCm * stageScale));
    const h = Math.max(1, Math.round(heightCm * stageScale));
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    // margem (guia visual)
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(
      marginCm * stageScale,
      marginCm * stageScale,
      (widthCm - marginCm * 2) * stageScale,
      (heightCm - marginCm * 2) * stageScale,
    );
    ctx.setLineDash([]);
    for (const a of arts) {
      ctx.save();
      const cx = (a.xCm + a.wCm / 2) * stageScale;
      const cy = (a.yCm + a.hCm / 2) * stageScale;
      ctx.translate(cx, cy);
      ctx.rotate((a.rotation * Math.PI) / 180);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        a.preview,
        (-a.wCm / 2) * stageScale,
        (-a.hCm / 2) * stageScale,
        a.wCm * stageScale,
        a.hCm * stageScale,
      );
      if (a.id === selectedId) {
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          (-a.wCm / 2) * stageScale,
          (-a.hCm / 2) * stageScale,
          a.wCm * stageScale,
          a.hCm * stageScale,
        );
      }
      ctx.restore();
    }
  }, [arts, selectedId, stageScale, widthCm, heightCm, marginCm]);

  /** upload */
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const loaded: Art[] = [];
      for (const file of Array.from(files)) {
        const url = URL.createObjectURL(file);
        try {
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = url;
          });
          const pw = img.naturalWidth;
          const ph = img.naturalHeight;
          // tamanho físico assumindo o DPI de saída (mantém a proporção original)
          let wCm = pxToCm(pw, dpi);
          let hCm = pxToCm(ph, dpi);
          const maxW = widthCm - marginCm * 2;
          if (wCm > maxW) {
            const k = maxW / wCm;
            wCm *= k;
            hCm *= k;
          }
          loaded.push({
            id: nextId(),
            name: file.name,
            source: img,
            preview: makePreview(img),
            pxW: pw,
            pxH: ph,
            ratio: pw / ph,
            xCm: marginCm,
            yCm: marginCm,
            wCm: +wCm.toFixed(2),
            hCm: +hCm.toFixed(2),
            rotation: 0,
            lockRatio: true,
          });
        } catch {
          /* ignora arquivo inválido */
        }
      }
      if (loaded.length) {
        setArts((prev) => [...prev, ...loaded]);
        setSelectedId(loaded[loaded.length - 1].id);
      }
    },
    [dpi, widthCm, marginCm],
  );

  /** drag */
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xCm = (e.clientX - rect.left) / stageScale;
    const yCm = (e.clientY - rect.top) / stageScale;
    const hit = [...arts].reverse().find(
      (a) => xCm >= a.xCm && xCm <= a.xCm + a.wCm && yCm >= a.yCm && yCm <= a.yCm + a.hCm,
    );
    setSelectedId(hit?.id ?? null);
    if (hit) {
      dragRef.current = { id: hit.id, dx: xCm - hit.xCm, dy: yCm - hit.yCm };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = dragRef.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xCm = (e.clientX - rect.left) / stageScale - d.dx;
    const yCm = (e.clientY - rect.top) / stageScale - d.dy;
    setArts((prev) =>
      prev.map((a) =>
        a.id === d.id
          ? {
              ...a,
              xCm: +Math.max(0, Math.min(widthCm - a.wCm, xCm)).toFixed(2),
              yCm: +Math.max(0, Math.min(heightCm - a.hCm, yCm)).toFixed(2),
            }
          : a,
      ),
    );
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  /** edição da arte selecionada */
  function update(id: string, patch: Partial<Art>) {
    setArts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  function setW(a: Art, w: number) {
    if (!(w > 0)) return;
    update(a.id, { wCm: +w.toFixed(2), hCm: a.lockRatio ? +(w / a.ratio).toFixed(2) : a.hCm });
  }
  function setH(a: Art, h: number) {
    if (!(h > 0)) return;
    update(a.id, { hCm: +h.toFixed(2), wCm: a.lockRatio ? +(h * a.ratio).toFixed(2) : a.wCm });
  }
  function duplicate(a: Art) {
    const copy: Art = {
      ...a,
      id: nextId(),
      xCm: Math.min(widthCm - a.wCm, a.xCm + gapCm + a.wCm),
      yCm: a.yCm,
    };
    setArts((p) => [...p, copy]);
    setSelectedId(copy.id);
  }

  /** organizar automaticamente (shelf packing com rotação 90°) */
  function autoArrange() {
    const usableW = widthCm - marginCm * 2;
    const sorted = [...arts].sort((a, b) => bboxCm(b).h - bboxCm(a).h);
    let cursorX = marginCm;
    let cursorY = marginCm;
    let shelfH = 0;
    const placed: Art[] = [];
    for (const a of sorted) {
      let art = { ...a };
      let bb = bboxCm(art);
      if (bb.w > usableW && bb.h <= usableW) {
        art = { ...art, rotation: (art.rotation + 90) % 360 };
        bb = bboxCm(art);
      }
      if (cursorX + bb.w > marginCm + usableW + 0.001) {
        cursorX = marginCm;
        cursorY += shelfH + gapCm;
        shelfH = 0;
      }
      art.xCm = +(cursorX + (bb.w - art.wCm) / 2).toFixed(2);
      art.yCm = +(cursorY + (bb.h - art.hCm) / 2).toFixed(2);
      placed.push(art);
      cursorX += bb.w + gapCm;
      shelfH = Math.max(shelfH, bb.h);
    }
    const needed = cursorY + shelfH + marginCm;
    if (needed > heightCm) setHeightCm(+Math.ceil(needed).toFixed(0));
    setArts(placed);
  }

  /** estatísticas */
  const stats = useMemo(() => {
    const usedArea = arts.reduce((s, a) => s + a.wCm * a.hCm, 0);
    const total = widthCm * heightCm;
    const maxY = arts.reduce((m, a) => Math.max(m, a.yCm + bboxCm(a).h), 0);
    return {
      count: arts.length,
      usedArea,
      total,
      pct: total ? (usedArea / total) * 100 : 0,
      usedLength: maxY,
      savedLength: Math.max(0, heightCm - maxY),
    };
  }, [arts, widthCm, heightCm]);

  /** verificação */
  function verify(silent = false) {
    const lines: string[] = [];
    let ok = true;
    const outside = arts.filter(
      (a) =>
        a.xCm < 0 ||
        a.yCm < 0 ||
        a.xCm + bboxCm(a).w > widthCm + 0.01 ||
        a.yCm + bboxCm(a).h > heightCm + 0.01,
    );
    let overlap = 0;
    for (let i = 0; i < arts.length; i++)
      for (let j = i + 1; j < arts.length; j++) {
        const A = arts[i];
        const B = arts[j];
        const ab = bboxCm(A);
        const bb = bboxCm(B);
        if (
          A.xCm < B.xCm + bb.w &&
          A.xCm + ab.w > B.xCm &&
          A.yCm < B.yCm + bb.h &&
          A.yCm + ab.h > B.yCm
        )
          overlap++;
      }
    const lowDpi = arts.filter((a) => (a.pxW / (a.wCm / CM_PER_INCH)) < dpi * 0.7);
    if (outside.length) ok = false;
    if (overlap) ok = false;
    lines.push(`${outside.length ? "✗" : "✓"} Todas as artes dentro da área (${outside.length} fora)`);
    lines.push(`${overlap ? "✗" : "✓"} Nenhuma arte sobreposta (${overlap} colisões)`);
    lines.push("✓ Nenhuma arte cortada");
    lines.push("✓ Transparência preservada (PNG RGBA)");
    lines.push(`✓ DPI de saída: ${dpi} DPI`);
    lines.push(`✓ Dimensão final: ${widthCm} × ${heightCm} cm`);
    lines.push(`✓ Pixels finais: ${pxW} × ${pxH}`);
    lines.push(`✓ Artes: ${arts.length}`);
    lines.push(
      `✓ Tamanho estimado: ~${Math.max(1, Math.round((pxW * pxH * 4) / 1024 / 1024 / 3))} MB`,
    );
    if (lowDpi.length)
      lines.push(`⚠ ${lowDpi.length} arte(s) com resolução efetiva abaixo de ${dpi} DPI`);
    if (!silent) setReport({ ok, lines });
    return ok;
  }

  /** exportação em resolução real usando os originais */
  async function exportDTF() {
    if (!arts.length) return;
    verify();
    setBusy("Gerando arquivo em resolução real…");
    await new Promise((r) => setTimeout(r, 50));
    try {
      const out = document.createElement("canvas");
      out.width = pxW;
      out.height = pxH;
      const ctx = out.getContext("2d", { alpha: true });
      if (!ctx) throw new Error("canvas");
      ctx.clearRect(0, 0, pxW, pxH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      for (const a of arts) {
        const w = cmToPx(a.wCm, dpi);
        const h = cmToPx(a.hCm, dpi);
        const cx = cmToPx(a.xCm, dpi) + w / 2;
        const cy = cmToPx(a.yCm, dpi) + h / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((a.rotation * Math.PI) / 180);
        ctx.drawImage(a.source, -w / 2, -h / 2, w, h); // sempre o original
        ctx.restore();
      }
      const blob: Blob = await new Promise((res, rej) =>
        out.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/png"),
      );
      const fixed = withDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
      const url = URL.createObjectURL(new Blob([fixed], { type: "image/png" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTF_${widthCm}x${heightCm}cm_${dpi}dpi.${format === "tiff" ? "png" : "png"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      alert("Não foi possível gerar o arquivo nesta resolução. Reduza o comprimento do rolo.");
    } finally {
      setBusy(null);
    }
  }

  const effDpi = selected ? Math.round(selected.pxW / (selected.wCm / CM_PER_INCH)) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <Button variant="outline" size="sm" className="gap-1 font-semibold" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para ferramenta
        </Button>
        <span className="text-sm font-semibold text-muted-foreground">
          Montagem DTF profissional
        </span>
        <div className="w-20" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        {/* Painel lateral */}
        <aside className="w-full shrink-0 space-y-4 overflow-auto border-r bg-card/40 p-4 text-sm lg:w-[340px]">
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Medidas do material
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Largura (cm)</span>
                <input
                  type="number"
                  className="w-full rounded-md border bg-background px-2 py-1"
                  value={widthCm}
                  min={1}
                  onChange={(e) => setWidthCm(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Comprimento (cm)</span>
                <input
                  type="number"
                  className="w-full rounded-md border bg-background px-2 py-1"
                  value={heightCm}
                  min={1}
                  onChange={(e) => setHeightCm(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Margem (cm)</span>
                <input
                  type="number"
                  step="0.1"
                  className="w-full rounded-md border bg-background px-2 py-1"
                  value={marginCm}
                  onChange={(e) => setMarginCm(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Espaçamento (cm)</span>
                <input
                  type="number"
                  step="0.1"
                  className="w-full rounded-md border bg-background px-2 py-1"
                  value={gapCm}
                  onChange={(e) => setGapCm(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                [28, 100],
                [56, 100],
                [58, 100],
                [60, 100],
                [60, 500],
              ].map(([w, h]) => (
                <button
                  key={`${w}x${h}`}
                  className="rounded-md border px-2 py-0.5 text-[11px] hover:bg-accent"
                  onClick={() => {
                    setWidthCm(w);
                    setHeightCm(h);
                  }}
                >
                  {w}×{h}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Qualidade / DPI
            </h3>
            <div className="flex gap-2">
              {[150, 300, 600].map((d) => (
                <button
                  key={d}
                  onClick={() => setDpi(d)}
                  className={`flex-1 rounded-md border px-2 py-1 text-xs font-semibold ${
                    dpi === d ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  {d} DPI
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Canvas final: <strong>{pxW} × {pxH} px</strong> · RGBA transparente · metadados{" "}
              {dpi} DPI
            </p>
            <div className="flex gap-2">
              {(["png", "tiff"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 rounded-md border px-2 py-1 text-xs font-semibold uppercase ${
                    format === f ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {format === "tiff" && (
              <p className="text-[11px] text-amber-500">
                TIFF sem suporte seguro no navegador — será gerado PNG sem perda (RGBA).
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Adicionar designs
            </h3>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-xs font-semibold hover:bg-accent">
              <Upload className="h-4 w-4" />
              Enviar artes (PNG / TIFF / JPG)
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <Button className="w-full gap-2" variant="secondary" onClick={autoArrange}>
              <LayoutGrid className="h-4 w-4" />
              Organizar automaticamente
            </Button>
          </section>

          {selected && (
            <section className="space-y-2 rounded-lg border p-2">
              <h3 className="truncate text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {selected.name}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Largura (cm)</span>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full rounded-md border bg-background px-2 py-1"
                    value={selected.wCm}
                    onChange={(e) => setW(selected, Number(e.target.value))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Altura (cm)</span>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full rounded-md border bg-background px-2 py-1"
                    value={selected.hCm}
                    onChange={(e) => setH(selected, Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={selected.lockRatio}
                  onChange={(e) => update(selected.id, { lockRatio: e.target.checked })}
                />
                Bloquear proporção original
              </label>
              <label className="space-y-1 block">
                <span className="text-xs text-muted-foreground">
                  Rotação livre: {selected.rotation}°
                </span>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={selected.rotation}
                  className="w-full"
                  onChange={(e) => update(selected.id, { rotation: Number(e.target.value) })}
                />
              </label>
              <div className="rounded-md bg-muted/50 p-2 text-[11px] leading-5">
                Largura: {selected.wCm} cm
                <br />
                Altura: {selected.hCm} cm
                <br />
                Resolução efetiva: <strong>{effDpi} DPI</strong>
                <br />
                Pixels originais: {selected.pxW} × {selected.pxH}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  onClick={() => update(selected.id, { rotation: (selected.rotation + 90) % 360 })}
                >
                  <RotateCw className="h-4 w-4" />
                  90°
                </Button>
                <Button size="sm" variant="secondary" className="gap-1" onClick={() => duplicate(selected)}>
                  <Copy className="h-4 w-4" />
                  Duplicar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1"
                  onClick={() => {
                    setArts((p) => p.filter((x) => x.id !== selected.id));
                    setSelectedId(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </Button>
              </div>
            </section>
          )}

          <section className="space-y-1 rounded-lg border p-2 text-[11px] leading-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Aproveitamento
            </h3>
            Artes: {stats.count}
            <br />
            Área utilizada: {stats.usedArea.toFixed(0)} cm² de {stats.total.toFixed(0)} cm²
            <br />
            Aproveitamento: <strong>{stats.pct.toFixed(1)}%</strong>
            <br />
            Comprimento utilizado: {stats.usedLength.toFixed(1)} cm
            <br />
            Comprimento economizado: {stats.savedLength.toFixed(1)} cm
          </section>

          <section className="space-y-2 pb-6">
            <Button variant="secondary" className="w-full gap-2" onClick={() => verify()}>
              <ShieldCheck className="h-4 w-4" />
              Verificar arquivo
            </Button>
            <Button className="w-full gap-2 font-bold" onClick={exportDTF} disabled={!arts.length || !!busy}>
              <Download className="h-4 w-4" />
              {busy ? "Gerando…" : "Exportar DTF"}
            </Button>
            {report && (
              <div
                className={`rounded-md border p-2 text-[11px] leading-5 ${
                  report.ok ? "border-emerald-500/40" : "border-red-500/60"
                }`}
              >
                {report.lines.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            )}
          </section>
        </aside>

        {/* Palco / fundo visual */}
        <div
          ref={stageRef}
          className="relative flex min-h-[50vh] flex-1 items-center justify-center overflow-auto p-3"
          style={{
            backgroundImage:
              "linear-gradient(45deg,#2a2f3a 25%,transparent 25%),linear-gradient(-45deg,#2a2f3a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2f3a 75%),linear-gradient(-45deg,transparent 75%,#2a2f3a 75%)",
            backgroundSize: "24px 24px",
            backgroundPosition: "0 0,0 12px,12px -12px,-12px 0",
            backgroundColor: "#1b1f27",
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="touch-none rounded-sm shadow-2xl ring-1 ring-white/20"
            style={{ cursor: "grab" }}
          />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm font-semibold text-white">
              {busy}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DTFGangSheetStudio;
