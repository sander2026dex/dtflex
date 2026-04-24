import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2, Settings2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_OPTIONS,
  loadImage,
  processImage,
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
  const [opts, setOpts] = useState<HalftoneOptions>({
    ...DEFAULT_OPTIONS,
    halftoneType: "circular",
  });
  const [livePreview, setLivePreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cachedImg = useRef<HTMLImageElement | null>(null);
  const previewTimer = useRef<number | null>(null);
  const previewRunId = useRef(0);

  const runPreview = useCallback(async (file: File, options: HalftoneOptions) => {
    const runId = ++previewRunId.current;
    setBusy(true);
    try {
      if (!cachedImg.current) {
        cachedImg.current = await loadImage(file);
      }
      const img = cachedImg.current;
      const blob = await processImage(
        img,
        options,
        (s, p) => {
          if (runId !== previewRunId.current) return;
          setStage(s);
          setPct(p);
        },
        700,
      );
      if (runId !== previewRunId.current) return;
      setPreviewResult((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return {
          blob,
          url: URL.createObjectURL(blob),
          filename: previewName(file.name),
          sizeKB: Math.round(blob.size / 1024),
        };
      });
    } finally {
      if (runId === previewRunId.current) {
        setBusy(false);
        setStage("");
        setPct(0);
      }
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      cachedImg.current = null;
      setSourceFile(file);
      setFullResult(null);
      setPreviewResult(null);
      const url = URL.createObjectURL(file);
      setSourcePreview(url);
      if (livePreview) {
        runPreview(file, opts);
      }
    },
    [livePreview, opts, runPreview],
  );

  useEffect(() => {
    if (!sourceFile || !livePreview) return;
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => {
      runPreview(sourceFile, opts);
    }, 260);
    return () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
    };
  }, [livePreview, opts, runPreview, sourceFile]);

  const runFullExport = useCallback(async () => {
    if (!sourceFile) return;
    previewRunId.current++;
    setBusy(true);
    setFullResult(null);
    try {
      const img = cachedImg.current ?? (await loadImage(sourceFile));
      cachedImg.current = img;
      const blob = await processImage(img, opts, (s, p) => {
        setStage(s);
        setPct(p);
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
  }, [opts, sourceFile]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && /image\//.test(file.type)) handleFile(file);
    },
    [handleFile],
  );

  const currentOutput = busy ? null : fullResult?.url ?? previewResult?.url ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{ background: "var(--gradient-glow)" }}
      />

      <main className="relative z-10">
        <section className="mx-auto max-w-7xl px-6 py-10">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary shadow-[var(--shadow-glow)]">
                  <ImageIcon className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  DTF / Silk · File Prep Tool
                </span>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                RIP profissional · 65 LPI · Elíptico CMYK
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Reconstrução real por pontos, ângulos CMYK (15° / 75° / 0° / 45°) sem moiré, dot gain
                −15% para tinta em tecido preto. Saída PNG transparente A2 @ 300 DPI.
              </p>
            </div>
            <div className="rounded-md border border-border bg-card/50 px-4 py-2 text-sm backdrop-blur">
              <span className="text-muted-foreground">Saída print-ready </span>
              <span className="font-mono text-primary">3307 × 4930 px · 300 DPI</span>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              {!sourcePreview ? (
                <Card
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  className="cursor-pointer border-2 border-dashed border-border bg-card/50 p-16 text-center backdrop-blur transition-colors hover:border-primary"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-1 text-lg font-semibold text-foreground">Solte sua arte aqui</h3>
                  <p className="text-sm text-muted-foreground">PNG, JPG ou WEBP com transparência preservada</p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                    }}
                  />
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <PreviewCard title="Original" url={sourcePreview} meta={sourceFile?.name ?? ""} />
                  <PreviewCard
                    title={fullResult ? "Final 300 DPI" : "Preview"}
                    url={currentOutput}
                    meta={
                      busy
                        ? "Processando…"
                        : fullResult
                          ? `${fullResult.sizeKB} KB · 3307×4930`
                          : previewResult
                            ? `${previewResult.sizeKB} KB · preview`
                            : "Aguardando render"
                    }
                    highlight={!!fullResult && !busy}
                    busy={busy}
                    pct={pct}
                    stage={stage}
                  />
                </div>
              )}

              {busy && (
                <Card className="bg-card/70 p-4 backdrop-blur">
                  <div className="mb-2 flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium text-foreground">{stage}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </Card>
              )}

              {sourceFile && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" onClick={runFullExport} disabled={busy} className="shadow-[var(--shadow-glow)]">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
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

            <Card className="h-fit space-y-5 bg-card/70 p-5 backdrop-blur lg:sticky lg:top-6">
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Parâmetros
                </h3>
                <div className="mb-4 flex items-center justify-between">
                  <Label htmlFor="live-preview" className="text-sm text-foreground">
                    Preview ao vivo
                  </Label>
                  <Switch id="live-preview" checked={livePreview} onCheckedChange={setLivePreview} />
                </div>
              </div>

              <Separator />

              <SliderRow
                label="LPI (frequência)"
                value={opts.lpi ?? 65}
                min={20}
                max={120}
                step={1}
                onChange={(v) => setOpts((o) => ({ ...o, lpi: v }))}
              />
              <SliderRow
                label="Ângulo da malha (°)"
                value={opts.angleDeg ?? 22}
                min={0}
                max={90}
                step={1}
                onChange={(v) => setOpts((o) => ({ ...o, angleDeg: v }))}
              />
              <SliderRow
                label="Grunge erosion"
                value={opts.grungeErosion ?? 0.45}
                min={0}
                max={0.9}
                step={0.05}
                format={(v) => `${(v * 100).toFixed(0)}%`}
                onChange={(v) => setOpts((o) => ({ ...o, grungeErosion: v }))}
              />
              <SliderRow
                label="Aura splatter (px)"
                value={opts.grungeAuraPx ?? 110}
                min={0}
                max={300}
                step={5}
                onChange={(v) => setOpts((o) => ({ ...o, grungeAuraPx: v }))}
              />
              <SliderRow
                label="Tolerância de fundo"
                value={opts.bgTolerance ?? 32}
                min={5}
                max={80}
                step={1}
                onChange={(v) => setOpts((o) => ({ ...o, bgTolerance: v }))}
              />
              <SliderRow
                label="Feather da máscara (px)"
                value={opts.featherPx ?? 4}
                min={0}
                max={10}
                step={1}
                onChange={(v) => setOpts((o) => ({ ...o, featherPx: v }))}
              />
              <SliderRow
                label="Black point"
                value={opts.blackPoint ?? 80}
                min={0}
                max={150}
                step={1}
                onChange={(v) => setOpts((o) => ({ ...o, blackPoint: v }))}
              />
              <SliderRow
                label="Midtone gamma"
                value={opts.midtoneGamma ?? 0.9}
                min={0.3}
                max={1.5}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => setOpts((o) => ({ ...o, midtoneGamma: v }))}
              />
              <SliderRow
                label="Unsharp"
                value={opts.unsharpAmount ?? 0.9}
                min={0}
                max={2}
                step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => setOpts((o) => ({ ...o, unsharpAmount: v }))}
              />
              <SliderRow
                label="Vibrance"
                value={opts.vibrance ?? 0.2}
                min={-0.3}
                max={0.6}
                step={0.05}
                format={(v) => `${(v * 100).toFixed(0)}%`}
                onChange={(v) => setOpts((o) => ({ ...o, vibrance: v }))}
              />

              <Separator />

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() =>
                  setOpts({ ...DEFAULT_OPTIONS, halftoneType: "circular" })
                }
              >
                Resetar parâmetros
              </Button>
            </Card>
          </div>
        </section>
      </main>
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
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-sm text-foreground">{label}</Label>
        <span className="font-mono text-xs text-primary">{format ? format(value) : value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function PreviewCard({
  title,
  url,
  meta,
  highlight,
  busy,
  pct,
  stage,
}: {
  title: string;
  url: string | null;
  meta: string;
  highlight?: boolean;
  busy?: boolean;
  pct?: number;
  stage?: string;
}) {
  return (
    <Card className={`bg-card/70 p-4 backdrop-blur transition-all ${highlight ? "ring-1 ring-primary shadow-[var(--shadow-glow)]" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className="ml-2 truncate font-mono text-xs text-muted-foreground/80">{meta}</span>
      </div>
      <div
        className="flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-md border border-border"
        style={{
          backgroundImage:
            "linear-gradient(45deg, color-mix(in oklab, var(--card) 70%, transparent) 25%, transparent 25%), linear-gradient(-45deg, color-mix(in oklab, var(--card) 70%, transparent) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, color-mix(in oklab, var(--card) 70%, transparent) 75%), linear-gradient(-45deg, transparent 75%, color-mix(in oklab, var(--card) 70%, transparent) 75%)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, 10px 0px",
        }}
      >
        {busy ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-xs font-medium text-foreground/80">Processando retícula em 300 DPI…</div>
            <div className="font-mono text-[10px] text-muted-foreground">{stage || "iniciando"} · {pct ?? 0}%</div>
            <div className="w-full max-w-[200px]">
              <Progress value={pct ?? 0} className="h-1" />
            </div>
          </div>
        ) : url ? (
          <img src={url} alt={title} className="max-h-full max-w-full object-contain" loading="lazy" />
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
