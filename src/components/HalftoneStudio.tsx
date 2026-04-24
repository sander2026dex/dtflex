import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2, Settings2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_OPTIONS,
  loadImage,
  processImage,
  type DotShape,
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
  const [opts, setOpts] = useState<HalftoneOptions>({ ...DEFAULT_OPTIONS });
  const [livePreview, setLivePreview] = useState(true);
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
    }, 280);
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

  const updateLpi = (raw: string) => {
    const n = Math.max(20, Math.min(100, Math.round(Number(raw) || 0)));
    setOpts((o) => ({ ...o, lpi: n }));
  };
  const updateAngle = (raw: string) => {
    const n = Math.max(0, Math.min(90, Math.round(Number(raw) || 0)));
    setOpts((o) => ({ ...o, angleDeg: n }));
  };

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
                  Real AM Halftone Generator
                </span>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Manual LPI · Angle · Dot Shape
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Reconstrução matemática por amplitude modulation. Highlights nunca viram buracos —
                pontos pequenos preservam toda a área. Aura preta opcional para "splatter" reticulado.
              </p>
            </div>
            <div className="rounded-md border border-border bg-card/50 px-4 py-2 text-sm backdrop-blur">
              <span className="text-muted-foreground">Output </span>
              <span className="font-mono text-primary">3307 × 4930 px · 300 DPI · PNG α</span>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
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
                  <p className="text-sm text-muted-foreground">PNG, JPG ou WEBP</p>
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
                    Gerar arquivo print-ready
                  </Button>
                  {fullResult && (
                    <Button asChild size="lg" variant="secondary">
                      <a href={fullResult.url} download={fullResult.filename}>
                        <Download className="h-4 w-4" />
                        Download PNG ({fullResult.sizeKB} KB)
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
                  Manual Settings
                </h3>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="lpi-input" className="text-xs text-muted-foreground">
                        LPI (20–100)
                      </Label>
                      <Input
                        id="lpi-input"
                        type="number"
                        min={20}
                        max={100}
                        value={opts.lpi ?? 65}
                        onChange={(e) => updateLpi(e.target.value)}
                        className="mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <Label htmlFor="angle-input" className="text-xs text-muted-foreground">
                        Angle ° (0–90)
                      </Label>
                      <Input
                        id="angle-input"
                        type="number"
                        min={0}
                        max={90}
                        value={opts.angleDeg ?? 45}
                        onChange={(e) => updateAngle(e.target.value)}
                        className="mt-1 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block text-xs text-muted-foreground">Dot Shape</Label>
                    <ToggleGroup
                      type="single"
                      value={opts.dotShape ?? "circular"}
                      onValueChange={(v) => {
                        if (!v) return;
                        setOpts((o) => ({ ...o, dotShape: v as DotShape }));
                      }}
                      className="grid grid-cols-2 gap-1"
                    >
                      <ToggleGroupItem value="circular" variant="outline" className="text-xs">
                        Circular
                      </ToggleGroupItem>
                      <ToggleGroupItem value="elliptical" variant="outline" className="text-xs">
                        Elliptical
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3 rounded-md border border-border/60 bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="aura-toggle" className="text-sm text-foreground">
                      Enable Outer Aura
                    </Label>
                    <p className="text-[11px] text-muted-foreground">Black halftone splatter atrás do sujeito</p>
                  </div>
                  <Switch
                    id="aura-toggle"
                    checked={!!opts.outerAura}
                    onCheckedChange={(on) => setOpts((o) => ({ ...o, outerAura: on }))}
                  />
                </div>

                {opts.outerAura && (
                  <>
                    <SliderRow
                      label="Aura width (px)"
                      value={opts.auraWidthPx ?? 280}
                      min={60}
                      max={600}
                      step={10}
                      onChange={(v) => setOpts((o) => ({ ...o, auraWidthPx: v }))}
                    />
                    <SliderRow
                      label="Aura intensity"
                      value={opts.auraIntensity ?? 0.85}
                      min={0.2}
                      max={1}
                      step={0.05}
                      format={(v) => `${(v * 100).toFixed(0)}%`}
                      onChange={(v) => setOpts((o) => ({ ...o, auraIntensity: v }))}
                    />
                    <SliderRow
                      label="Background tolerance"
                      value={opts.bgTolerance ?? 38}
                      min={5}
                      max={80}
                      step={1}
                      onChange={(v) => setOpts((o) => ({ ...o, bgTolerance: v }))}
                    />
                  </>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <Label htmlFor="live-preview" className="text-sm text-foreground">
                  Preview ao vivo
                </Label>
                <Switch id="live-preview" checked={livePreview} onCheckedChange={setLivePreview} />
              </div>

              <SliderRow
                label="Vibrance"
                value={opts.vibrance ?? 0.15}
                min={0}
                max={0.5}
                step={0.05}
                format={(v) => `+${(v * 100).toFixed(0)}%`}
                onChange={(v) => setOpts((o) => ({ ...o, vibrance: v }))}
              />
              <SliderRow
                label="Black point"
                value={opts.blackPoint ?? 0}
                min={0}
                max={60}
                step={1}
                onChange={(v) => setOpts((o) => ({ ...o, blackPoint: v }))}
              />
              <SliderRow
                label="Midtone gamma"
                value={opts.midtoneGamma ?? 1.0}
                min={0.5}
                max={1.5}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => setOpts((o) => ({ ...o, midtoneGamma: v }))}
              />
              <SliderRow
                label="Unsharp"
                value={opts.unsharpAmount ?? 0.5}
                min={0}
                max={1.5}
                step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => setOpts((o) => ({ ...o, unsharpAmount: v }))}
              />

              <Separator />

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setOpts({ ...DEFAULT_OPTIONS })}
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
