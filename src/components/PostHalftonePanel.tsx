import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Upload, Download, Layers } from "lucide-react";
import { setPngDpi } from "@/lib/png-dpi";

type Mode = "vazar" | "solido" | "reticular";

type ChannelKey = "c" | "m" | "y" | "k";

const CHANNELS: { key: ChannelKey; label: string; rgb: [number, number, number] }[] = [
  { key: "c", label: "Ciano", rgb: [0, 174, 239] },
  { key: "m", label: "Magenta", rgb: [236, 0, 140] },
  { key: "y", label: "Amarelo", rgb: [255, 222, 0] },
  { key: "k", label: "Preto", rgb: [0, 0, 0] },
];

interface PanelProps {
  trigger: React.ReactNode;
}

export function PostHalftonePanel({ trigger }: PanelProps) {
  const [open, setOpen] = useState(false);
  const [srcBitmap, setSrcBitmap] = useState<ImageBitmap | null>(null);
  const [modes, setModes] = useState<Record<ChannelKey, Mode>>({
    c: "reticular",
    m: "reticular",
    y: "reticular",
    k: "solido",
  });
  const [dotSize, setDotSize] = useState(6); // px
  const [threshold, setThreshold] = useState(128); // 0..255
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onFile = useCallback(async (file: File) => {
    const bmp = await createImageBitmap(file);
    setSrcBitmap(bmp);
  }, []);

  const render = useCallback(async () => {
    if (!srcBitmap || !canvasRef.current) return;
    const w = srcBitmap.width;
    const h = srcBitmap.height;
    const canvas = canvasRef.current;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(srcBitmap, 0, 0);
    const src = ctx.getImageData(0, 0, w, h);
    const data = src.data;

    // Build output transparent
    const out = ctx.createImageData(w, h);
    const od = out.data;

    // CMYK separation per pixel
    // K = 1 - max(R,G,B); C=(1-R-K)/(1-K) etc.
    // For each channel: vazar => skip, solido => fill with chan intensity, reticular => dot pattern.

    const step = Math.max(2, Math.round(dotSize));
    const radiusMax = step / 2;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = data[i + 3];
        if (a === 0) continue;
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const k = 1 - Math.max(r, g, b);
        const denom = 1 - k || 1;
        const c = k >= 1 ? 0 : (1 - r - k) / denom;
        const m = k >= 1 ? 0 : (1 - g - k) / denom;
        const yy = k >= 1 ? 0 : (1 - b - k) / denom;
        const ch: Record<ChannelKey, number> = { c, m, y: yy, k };

        // Determine which channel is dominant at this pixel for output color.
        // For each channel that is "solido", paint with channel color weighted by intensity.
        // For "reticular", paint only at cell center within dot radius proportional to intensity.
        // For "vazar", skip the contribution (transparent).

        // We composite: first solid pass, then reticular (overrides if active inside dot)
        let R = 0, G = 0, B = 0, A = 0;

        for (const cfg of CHANNELS) {
          const intensity = ch[cfg.key];
          if (intensity <= 0.02) continue;
          const mode = modes[cfg.key];
          if (mode === "vazar") continue;
          if (mode === "solido") {
            // mix using "multiply-like" toward channel color, weighted by intensity
            const w1 = intensity * (a / 255);
            R += cfg.rgb[0] * w1;
            G += cfg.rgb[1] * w1;
            B += cfg.rgb[2] * w1;
            A += 255 * w1;
          } else {
            // reticular: dot of radius proportional to intensity inside this cell
            const cx = Math.floor(x / step) * step + Math.floor(step / 2);
            const cy = Math.floor(y / step) * step + Math.floor(step / 2);
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const radius = radiusMax * Math.sqrt(intensity);
            if (dist <= radius) {
              R += cfg.rgb[0];
              G += cfg.rgb[1];
              B += cfg.rgb[2];
              A += 255;
            }
          }
        }

        if (A > 0) {
          const norm = Math.min(1, A / 255);
          od[i] = Math.min(255, R / Math.max(1, A / 255));
          od[i + 1] = Math.min(255, G / Math.max(1, A / 255));
          od[i + 2] = Math.min(255, B / Math.max(1, A / 255));
          od[i + 3] = Math.min(255, Math.round(255 * norm));
        }
      }
    }

    ctx.putImageData(out, 0, 0);
  }, [srcBitmap, modes, dotSize]);

  useEffect(() => {
    void render();
  }, [render]);

  const onExport = useCallback(async () => {
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      const blob: Blob = await new Promise((resolve) =>
        canvasRef.current!.toBlob((b) => resolve(b!), "image/png"),
      );
      const fixed = await setPngDpi(blob, 300);
      const url = URL.createObjectURL(fixed);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dtflex-300dpi-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }, []);

  const channelModes = useMemo(() => CHANNELS, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Vazar / Sólido / Reticular por canal · Export 300 DPI real</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">PNG de entrada</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
              <Button
                variant="secondary"
                className="mt-1 w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {srcBitmap ? `Trocar (${srcBitmap.width}×${srcBitmap.height})` : "Carregar PNG"}
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Modo por canal</Label>
              {channelModes.map((cfg) => (
                <div key={cfg.key} className="rounded-md border border-border p-2">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                    <span
                      className="inline-block h-3 w-3 rounded-full border border-black/30"
                      style={{ background: `rgb(${cfg.rgb.join(",")})` }}
                    />
                    {cfg.label}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(["vazar", "solido", "reticular"] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModes((prev) => ({ ...prev, [cfg.key]: m }))}
                        className={`rounded px-2 py-1 text-[11px] font-semibold uppercase ${
                          modes[cfg.key] === m
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/70"
                        }`}
                      >
                        {m === "vazar" ? "Vazar" : m === "solido" ? "Sólido" : "Reticular"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Tamanho do ponto · {dotSize}px
              </Label>
              <Slider
                min={2}
                max={20}
                step={1}
                value={[dotSize]}
                onValueChange={(v) => setDotSize(v[0])}
              />
            </div>

            <Button onClick={onExport} disabled={!srcBitmap || busy} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Exportar PNG 300 DPI
            </Button>
            <p className="text-[11px] leading-snug text-muted-foreground">
              O DPI é gravado no chunk <code>pHYs</code> (11811 px/m). Verifique nos metadados do arquivo.
            </p>
          </div>

          <div className="flex min-h-[400px] items-center justify-center overflow-auto rounded-md border border-border bg-[conic-gradient(at_50%_50%,#1a1a1a_0%,#222_25%,#1a1a1a_50%,#222_75%,#1a1a1a_100%)] p-2">
            {srcBitmap ? (
              <canvas ref={canvasRef} className="max-h-[70vh] max-w-full" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Layers className="h-10 w-10 opacity-50" />
                Carregue o PNG exportado da ferramenta para aplicar Vazar/Sólido/Reticular por canal.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
