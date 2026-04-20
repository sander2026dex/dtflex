import { useCallback, useRef, useState } from "react";
import { Upload, Download, Loader2, ImageIcon, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_OPTIONS,
  processImage,
  loadImage,
  type HalftoneOptions,
} from "@/lib/halftone";

interface ProcessedResult {
  blob: Blob;
  url: string;
  filename: string;
  sizeKB: number;
}

export function HalftoneStudio() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<ProcessedResult | null>(null);
  const [fullResult, setFullResult] = useState<ProcessedResult | null>(null);
  const [stage, setStage] = useState("");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<HalftoneOptions>(DEFAULT_OPTIONS);
  const [livePreview, setLivePreview] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setSourceFile(file);
    setFullResult(null);
    setPreviewResult(null);
    const url = URL.createObjectURL(file);
    setSourcePreview(url);

    if (livePreview) {
      setBusy(true);
      try {
        const img = await loadImage(file);
        const blob = await processImage(img, opts, (s, p) => {
          setStage(s); setPct(p);
        }, 900);
        setPreviewResult({
          blob, url: URL.createObjectURL(blob),
          filename: previewName(file.name), sizeKB: Math.round(blob.size / 1024),
        });
      } finally {
        setBusy(false);
        setStage("");
        setPct(0);
      }
    }
  }, [opts, livePreview]);

  const runFullExport = useCallback(async () => {
    if (!sourceFile) return;
    setBusy(true);
    setFullResult(null);
    try {
      const img = await loadImage(sourceFile);
      const blob = await processImage(img, opts, (s, p) => {
        setStage(s); setPct(p);
      });
      setFullResult({
        blob,
        url: URL.createObjectURL(blob),
        filename: exportName(sourceFile.name),
        sizeKB: Math.round(blob.size / 1024),
      });
    } finally {
      setBusy(false);
      setStage("");
      setPct(0);
    }
  }, [sourceFile, opts]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && /image\//.test(f.type)) handleFile(f);
  }, [handleFile]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "var(--gradient-glow)" }}
      />
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-10">
        <header className="mb-10 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center shadow-[var(--shadow-glow)]">
                <ImageIcon className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Offset · Alta Fidelidade
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Halftone Studio
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Pipeline 300 DPI · Retícula AM 35 LPI @ 22° · Pontos circulares ·
              Pôster sobre papel branco com vignette radial.
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-card/50 backdrop-blur">
            <span className="text-xs text-muted-foreground">Target</span>
            <span className="font-mono text-sm text-primary">
              3307 × 4961 px
            </span>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* MAIN AREA */}
          <div className="space-y-6">
            {!sourcePreview ? (
              <Card
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="border-dashed border-2 hover:border-primary transition-colors cursor-pointer p-16 text-center bg-card/50 backdrop-blur"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-1">
                  Solte sua imagem aqui
                </h3>
                <p className="text-sm text-muted-foreground">
                  PNG ou JPEG · Canal alpha preservado
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <PreviewCard
                  title="Original"
                  url={sourcePreview}
                  meta={sourceFile?.name ?? ""}
                />
                <PreviewCard
                  title={fullResult ? "Final 300 DPI" : "Preview rápido"}
                  url={fullResult?.url ?? previewResult?.url ?? null}
                  meta={
                    fullResult
                      ? `${fullResult.sizeKB} KB · 3307×4961`
                      : previewResult
                      ? `${previewResult.sizeKB} KB · preview`
                      : "—"
                  }
                  highlight={!!fullResult}
                />
              </div>
            )}

            {busy && (
              <Card className="p-4 bg-card/70 backdrop-blur">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">{stage}</span>
                  <span className="ml-auto text-xs text-muted-foreground font-mono">
                    {pct}%
                  </span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </Card>
            )}

            {sourceFile && (
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  size="lg"
                  onClick={runFullExport}
                  disabled={busy}
                  className="shadow-[var(--shadow-glow)]"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Settings2 className="h-4 w-4" />
                  )}
                  Renderizar em 300 DPI
                </Button>
                {fullResult && (
                  <Button asChild size="lg" variant="secondary">
                    <a href={fullResult.url} download={fullResult.filename}>
                      <Download className="h-4 w-4" />
                      Baixar PNG ({fullResult.sizeKB} KB)
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSourceFile(null);
                    setSourcePreview(null);
                    setPreviewResult(null);
                    setFullResult(null);
                  }}
                  disabled={busy}
                >
                  Trocar imagem
                </Button>
              </div>
            )}
          </div>

          {/* SIDEBAR CONTROLS */}
          <Card className="p-5 bg-card/70 backdrop-blur h-fit lg:sticky lg:top-6 space-y-5">
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">
                Parâmetros
              </h3>
              <div className="flex items-center justify-between mb-4">
                <Label htmlFor="lp" className="text-sm">
                  Preview ao vivo
                </Label>
                <Switch
                  id="lp"
                  checked={livePreview}
                  onCheckedChange={setLivePreview}
                />
              </div>
            </div>

            <Separator />

            <SliderRow
              label="LPI (frequência)"
              value={opts.lpi ?? 35}
              min={20} max={80} step={1}
              onChange={(v) => setOpts((o) => ({ ...o, lpi: v }))}
            />
            <SliderRow
              label="Ângulo da malha (°)"
              value={opts.angleDeg ?? 22}
              min={0} max={90} step={1}
              onChange={(v) => setOpts((o) => ({ ...o, angleDeg: v }))}
            />
            <SliderRow
              label="Black Point"
              value={opts.blackPoint ?? 80}
              min={0} max={150} step={1}
              onChange={(v) => setOpts((o) => ({ ...o, blackPoint: v }))}
            />
            <SliderRow
              label="Midtone Gamma"
              value={opts.midtoneGamma ?? 0.7}
              min={0.3} max={1.5} step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => setOpts((o) => ({ ...o, midtoneGamma: v }))}
            />
            <SliderRow
              label="Unsharp"
              value={opts.unsharpAmount ?? 0.6}
              min={0} max={2} step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(v) => setOpts((o) => ({ ...o, unsharpAmount: v }))}
            />
            <SliderRow
              label="Vibrance"
              value={opts.vibrance ?? 0.15}
              min={-0.3} max={0.6} step={0.05}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(v) => setOpts((o) => ({ ...o, vibrance: v }))}
            />
            <SliderRow
              label="Warmth (dourado)"
              value={opts.warmth ?? 0.08}
              min={0} max={0.25} step={0.01}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={(v) => setOpts((o) => ({ ...o, warmth: v }))}
            />
            <SliderRow
              label="High-Key Lift"
              value={opts.highKeyLift ?? 0.18}
              min={0} max={0.4} step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(v) => setOpts((o) => ({ ...o, highKeyLift: v }))}
            />
            <SliderRow
              label="Vignette início"
              value={opts.vignetteInner ?? 0.55}
              min={0.1} max={0.9} step={0.02}
              format={(v) => v.toFixed(2)}
              onChange={(v) => setOpts((o) => ({ ...o, vignetteInner: v }))}
            />
            <SliderRow
              label="Vignette fim (branco)"
              value={opts.vignetteOuter ?? 0.95}
              min={0.5} max={1.2} step={0.02}
              format={(v) => v.toFixed(2)}
              onChange={(v) => setOpts((o) => ({ ...o, vignetteOuter: v }))}
            />

            <Separator />

            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setOpts(DEFAULT_OPTIONS)}
            >
              Resetar para defaults
            </Button>
          </Card>
        </div>

        <footer className="mt-12 text-xs text-muted-foreground/70 font-mono text-center">
          AM Halftone · Circular dot · 35 LPI · 22° · 300 DPI · PNG 32-bit RGBA
        </footer>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm">{label}</Label>
        <span className="font-mono text-xs text-primary">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]} min={min} max={max} step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function PreviewCard({
  title, url, meta, highlight, checkered,
}: {
  title: string; url: string | null; meta: string;
  highlight?: boolean; checkered?: boolean;
}) {
  return (
    <Card
      className={`p-4 bg-card/70 backdrop-blur transition-all ${
        highlight ? "ring-1 ring-primary shadow-[var(--shadow-glow)]" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="font-mono text-xs text-muted-foreground/80 truncate ml-2">
          {meta}
        </span>
      </div>
      <div
        className="aspect-[2/3] w-full rounded-md overflow-hidden border border-border flex items-center justify-center"
        style={
          checkered
            ? {
                backgroundImage:
                  "linear-gradient(45deg,#1f2937 25%,transparent 25%),linear-gradient(-45deg,#1f2937 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1f2937 75%),linear-gradient(-45deg,transparent 75%,#1f2937 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
              }
            : { background: "oklch(0.10 0.01 240)" }
        }
      >
        {url ? (
          <img
            src={url}
            alt={title}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-sm text-muted-foreground">aguardando…</span>
        )}
      </div>
    </Card>
  );
}

function exportName(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}_halftone_300dpi.png`;
}
function previewName(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}_preview.png`;
}
