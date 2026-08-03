import { useCallback, useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import { Download, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShirtMockup, getShirtSrc, type ShirtModel, type ShirtSide } from "./ShirtMockup";
import { cn } from "@/lib/utils";

// A3 proportion (297 x 420mm)
const STAGE_W = 500;
const STAGE_H = 707;

const MODELS: { id: ShirtModel; label: string }[] = [
  { id: "careca", label: "Gola Careca" },
  { id: "v", label: "Gola V" },
  { id: "regata", label: "Regata" },
  { id: "polo", label: "Polo" },
  { id: "manga-longa", label: "Manga Longa" },
];

const SIDES: { id: ShirtSide; label: string }[] = [
  { id: "frente", label: "Frente" },
  { id: "costas", label: "Costas" },
  { id: "lado-esq", label: "Lado Esq." },
  { id: "lado-dir", label: "Lado Dir." },
];

const SHIRT_COLORS = [
  "#ffffff",
  "#111111",
  "#6b7280",
  "#1e3a8a",
  "#b91c1c",
  "#15803d",
  "#f59e0b",
  "#7c3aed",
  "#ec4899",
  "#0f766e",
];

export default function ShirtStudioCanvas() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const statesRef = useRef<Record<string, string>>({});

  const [model, setModel] = useState<ShirtModel>("careca");
  const [side, setSide] = useState<ShirtSide>("frente");
  const [shirtColor, setShirtColor] = useState("#111111");
  const [studioBg, setStudioBg] = useState("#0e1116");
  const [hasArt, setHasArt] = useState(false);
  const sideRef = useRef<ShirtSide>(side);

  // init fabric
  useEffect(() => {
    if (!canvasElRef.current) return;
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: STAGE_W,
      height: STAGE_H,
      backgroundColor: "transparent",
      preserveObjectStacking: true,
      selection: false,
    });
    fabricRef.current = canvas;
    const sync = () => setHasArt(canvas.getObjects().length > 0);
    canvas.on("object:added", sync);
    canvas.on("object:removed", sync);
    return () => {
      void canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  // persist / restore art per side
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const prev = sideRef.current;
    if (prev !== side) {
      statesRef.current[prev] = JSON.stringify(canvas.toJSON());
      sideRef.current = side;
      canvas.clear();
      canvas.backgroundColor = "transparent";
      const saved = statesRef.current[side];
      if (saved) {
        void canvas.loadFromJSON(saved).then((c) => {
          c.getObjects().forEach((o) => styleHandles(o));
          c.requestRenderAll();
          setHasArt(c.getObjects().length > 0);
        });
      } else {
        canvas.requestRenderAll();
        setHasArt(false);
      }
    }
  }, [side]);

  const styleHandles = (obj: fabric.FabricObject) => {
    obj.set({
      cornerColor: "#3b82f6",
      cornerStyle: "circle",
      transparentCorners: false,
      borderColor: "#3b82f6",
      cornerSize: 10,
    });
  };

  const handleFile = useCallback(async (file: File) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const url = URL.createObjectURL(file);
    try {
      const img = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      // free placement: no clip, just fit comfortably inside the stage
      const scale = Math.min(
        (STAGE_W * 0.5) / (img.width || 1),
        (STAGE_H * 0.5) / (img.height || 1),
      );
      img.set({
        originX: "center",
        originY: "center",
        left: STAGE_W / 2,
        top: STAGE_H / 2,
        scaleX: scale,
        scaleY: scale,
      });
      styleHandles(img);
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

  const removeActive = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length) active.forEach((o) => canvas.remove(o));
    else canvas.getObjects().forEach((o) => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  const loadImg = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });

  // Exports the full mockup: studio background + colored shirt + artwork
  const exportMockup = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const scale = 4;
    const W = STAGE_W * scale;
    const H = STAGE_H * scale;

    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = studioBg;
    ctx.fillRect(0, 0, W, H);

    const shirt = await loadImg(getShirtSrc(model, sideRef.current));
    // contain fit
    const r = Math.min(W / shirt.width, H / shirt.height);
    const sw = shirt.width * r;
    const sh = shirt.height * r;
    const sx = (W - sw) / 2;
    const sy = (H - sh) / 2;

    const layer = document.createElement("canvas");
    layer.width = W;
    layer.height = H;
    const lctx = layer.getContext("2d");
    if (!lctx) return;
    if (sideRef.current === "lado-dir") {
      lctx.translate(W, 0);
      lctx.scale(-1, 1);
    }
    lctx.drawImage(shirt, sx, sy, sw, sh);
    lctx.globalCompositeOperation = "source-in";
    lctx.fillStyle = shirtColor;
    lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = "multiply";
    lctx.drawImage(shirt, sx, sy, sw, sh);
    // restore shirt alpha (multiply can bleed outside)
    lctx.globalCompositeOperation = "destination-in";
    lctx.drawImage(shirt, sx, sy, sw, sh);

    ctx.drawImage(layer, 0, 0);

    // artwork on top
    const artUrl = canvas.toDataURL({
      format: "png",
      multiplier: scale,
      left: 0,
      top: 0,
      width: STAGE_W,
      height: STAGE_H,
      enableRetinaScaling: false,
    });
    const art = await loadImg(artUrl);
    ctx.drawImage(art, 0, 0, W, H);

    // watermark
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((-30 * Math.PI) / 180);
    ctx.font = `700 ${Math.round(W / 7)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillText("DTFLEXPRO", 0, 0);
    ctx.restore();

    const link = document.createElement("a");
    link.href = out.toDataURL("image/png");
    link.download = `dtflexpro-mockup-${model}-${sideRef.current}.png`;
    link.click();
  };

  const exportArt = async () => {
    const canvas = fabricRef.current;
    if (!canvas || canvas.getObjects().length === 0) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const watermark = new fabric.FabricText("DTFLEXPRO", {
      fontSize: Math.round(STAGE_W / 7),
      fontFamily: "Inter, sans-serif",
      fontWeight: "700",
      fill: "rgba(255,255,255,0.28)",
      stroke: "rgba(0,0,0,0.18)",
      strokeWidth: 0.5,
      angle: -30,
      originX: "center",
      originY: "center",
      left: STAGE_W / 2,
      top: STAGE_H / 2,
      selectable: false,
      evented: false,
    });
    canvas.add(watermark);
    canvas.requestRenderAll();

    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: 4,
      left: 0,
      top: 0,
      width: STAGE_W,
      height: STAGE_H,
      enableRetinaScaling: false,
    });

    canvas.remove(watermark);
    canvas.requestRenderAll();

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `dtflexpro-${model}-${sideRef.current}-a3.png`;
    link.click();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Preview — A3 */}
      <div
        className="relative flex items-center justify-center rounded-3xl border border-border p-6 shadow-[var(--shadow-panel)] transition-colors"
        style={{ backgroundColor: studioBg }}
      >
        <div className="relative w-full max-w-[420px]" style={{ aspectRatio: "297 / 420" }}>
          <div className="absolute inset-0">
            <ShirtMockup model={model} side={side} color={shirtColor} />
          </div>
          <canvas
            ref={canvasElRef}
            width={STAGE_W}
            height={STAGE_H}
            className="absolute inset-0 !h-full !w-full"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6 rounded-3xl border border-border bg-card/70 p-6 backdrop-blur">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modelo</p>
          <div className="grid grid-cols-2 gap-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium transition-all hover:border-primary hover:bg-primary/10",
                  model === m.id ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lado da peça</p>
          <div className="grid grid-cols-2 gap-2">
            {SIDES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSide(s.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium transition-all hover:border-accent hover:bg-accent/10",
                  side === s.id ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cor da camisa</p>
          <div className="flex flex-wrap gap-2">
            {SHIRT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => setShirtColor(c)}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                  shirtColor === c ? "border-primary ring-2 ring-primary/40" : "border-border",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-border">
              <input
                type="color"
                value={shirtColor}
                onChange={(e) => setShirtColor(e.target.value)}
                className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fundo do estúdio</p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={studioBg}
              onChange={(e) => setStudioBg(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-md border border-border bg-transparent p-1"
            />
            <div className="flex gap-2">
              {["#0e1116", "#f1f5f9", "#1f2937", "#e2e8f0"].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Fundo ${c}`}
                  onClick={() => setStudioBg(c)}
                  className="h-8 w-8 rounded-md border border-border transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <Button className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Enviar arte (PNG/JPG)
          </Button>
          <Button variant="secondary" className="w-full" onClick={removeActive} disabled={!hasArt}>
            <Trash2 className="h-4 w-4" />
            Remover arte selecionada
          </Button>
          <Button variant="default" className="w-full" onClick={() => void exportMockup()}>
            <Download className="h-4 w-4" />
            Salvar mockup com camisa (PNG 4x)
          </Button>
          <Button variant="outline" className="w-full" onClick={() => void exportArt()} disabled={!hasArt}>
            <Download className="h-4 w-4" />
            Salvar só a arte (PNG transparente)
          </Button>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Posicione a arte livremente em qualquer ponto da camisa. Exportação em PNG transparente no formato A3 com
            escala 4x e marca d'água DTFLEXPRO.
          </p>
        </div>
      </div>
    </div>
  );
}
