import { useCallback, useRef, useState } from "react";
import { Download, ImageIcon, Loader2, Settings2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_OPTIONS,
  loadImage,
  processImage,
  type HalftoneMode,
  type HalftoneOptions,
} from "@/lib/halftone";

interface ProcessedResult {
  blob: Blob;
  url: string;
  filename: string;
  sizeKB: number;
}

const LPI_MIN = 22;
const LPI_MAX = 45;
const LPI_DEFAULT = 35;
const ANGLE_MIN = 0;
const ANGLE_MAX = 360;
const ANGLE_DEFAULT = 45;


export function HalftoneStudio() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [fullResult, setFullResult] = useState<ProcessedResult | null>(null);
  const [stage, setStage] = useState("");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<HalftoneOptions>({ ...DEFAULT_OPTIONS, lpi: LPI_DEFAULT });
  const inputRef = useRef<HTMLInputElement>(null);
  const cachedImg = useRef<HTMLImageElement | null>(null);

  const handleFile = useCallback(async (file: File) => {
    cachedImg.current = null;
    setSourceFile(file);
    setFullResult(null);
    const url = URL.createObjectURL(file);
    setSourcePreview(url);
  }, []);

  const runFullExport = useCallback(async () => {
    if (!sourceFile) return;
    setBusy(true);
    // Process-then-reveal: hide previous result during processing.
    if (fullResult?.url) URL.revokeObjectURL(fullResult.url);
    setFullResult(null);
    try {
      const img = cachedImg.current ?? (await loadImage(sourceFile));
      cachedImg.current = img;
      // All halftone math runs on OffscreenCanvas inside processImage().
      const blob = await processImage(img, opts, (s, p) => {
        setStage(s);
        setPct(p);
      });
      // ONLY now reveal the final image.
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
  }, [opts, sourceFile, fullResult]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && /image\//.test(file.type)) handleFile(file);
    },
    [handleFile],
  );

  const mode: HalftoneMode = opts.mode ?? "spot_white_cmyk";
  const lpi = opts.lpi ?? LPI_DEFAULT;
  const angle = opts.baseAngleDeg ?? ANGLE_DEFAULT;
  const rosetteIntensity = Math.round((opts.rosetteIntensity ?? 0.5) * 100);
  const whiteThreshold = Math.round((opts.whiteThreshold ?? 0.4) * 100);

  const setLpi = (raw: number) => {
    if (Number.isNaN(raw)) return;
    const clamped = Math.max(LPI_MIN, Math.min(LPI_MAX, Math.round(raw)));
    setOpts((o) => ({ ...o, lpi: clamped }));
  };

  const setAngle = (raw: number) => {
    if (Number.isNaN(raw)) return;
    const clamped = Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, Math.round(raw)));
    setOpts((o) => ({ ...o, baseAngleDeg: clamped }));
  };

  const setRosetteIntensity = (raw: number) => {
    if (Number.isNaN(raw)) return;
    const clamped = Math.max(0, Math.min(100, Math.round(raw)));
    setOpts((o) => ({ ...o, rosetteIntensity: clamped / 100 }));
  };

  const setWhiteThreshold = (raw: number) => {
    if (Number.isNaN(raw)) return;
    const clamped = Math.max(0, Math.min(100, Math.round(raw)));
    setOpts((o) => ({ ...o, whiteThreshold: clamped / 100 }));
  };

  const switchMode = (newMode: HalftoneMode) => {
    setOpts((o) => ({ ...o, mode: newMode }));
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
                  Dual-Mode Halftone Engine · DTF
                </span>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                🟠 Rosette CMYK · 🔵 Round Clean
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Fundo 100% transparente (vazado), pontos mínimos de 1.5px (~0.5mm) — sem buracos
                brancos. Processamento em OffscreenCanvas; o resultado só aparece quando 100%
                pronto.
              </p>
            </div>
            <div className="rounded-md border border-border bg-card/50 px-4 py-2 text-sm backdrop-blur">
              <span className="text-muted-foreground">Output </span>
              <span className="font-mono text-primary">3307 × 4930 px · 300 DPI · PNG-32</span>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
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
                    title={fullResult ? "Final 300 DPI · PNG-32" : "Resultado"}
                    // PROCESS-THEN-REVEAL: only show URL when not busy AND fully done.
                    url={busy ? null : fullResult?.url ?? null}
                    meta={
                      busy
                        ? "Processando…"
                        : fullResult
                          ? `${fullResult.sizeKB} KB · 3307×4930 · transparente`
                          : "Clique em Gerar para processar"
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
                    Gerar Halftone
                  </Button>
                  {fullResult && !busy && (
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
                      if (fullResult?.url) URL.revokeObjectURL(fullResult.url);
                      setSourceFile(null);
                      setSourcePreview(null);
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
                  Render Mode
                </h3>
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={(v) => v && switchMode(v as HalftoneMode)}
                  className="grid grid-cols-2 gap-1"
                  disabled={busy}
                >
                  <ToggleGroupItem value="spot_white_cmyk" variant="outline" className="text-[11px]">
                    ⚪ Spot White
                  </ToggleGroupItem>
                  <ToggleGroupItem value="rosette_cmyk" variant="outline" className="text-[11px]">
                    🟠 Rosette
                  </ToggleGroupItem>
                  <ToggleGroupItem value="round_clean" variant="outline" className="text-[11px]">
                    🔵 Circular
                  </ToggleGroupItem>
                  <ToggleGroupItem value="hybrid" variant="outline" className="text-[11px]">
                    🟣 Hybrid
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {mode === "spot_white_cmyk"
                    ? "Underbase branca + CMYK por cima. Padrão profissional para tecido escuro — rostos e camisas brancas ficam densos, não fantasmas."
                    : mode === "rosette_cmyk"
                      ? "4 telas C/M/Y/K em ângulos fixos (15°/75°/0°/45°). Sem underbase — light areas vazadas."
                      : mode === "round_clean"
                        ? "Grade única + aura colorida orgânica em volta do sujeito. Fundo vazado."
                        : "Mix entre Circular e Rosette. Slider de intensidade controla a interferência."}
                </p>
              </div>

              <Separator />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-sm text-foreground">LPI (Lines per Inch)</Label>
                  <Input
                    type="number"
                    value={lpi}
                    min={LPI_MIN}
                    max={LPI_MAX}
                    step={1}
                    disabled={busy}
                    onChange={(e) => setLpi(parseInt(e.target.value, 10))}
                    className="h-7 w-20 text-right font-mono text-xs"
                  />
                </div>
                <Slider
                  value={[lpi]}
                  min={LPI_MIN}
                  max={LPI_MAX}
                  step={1}
                  disabled={busy}
                  onValueChange={([v]) => setLpi(v)}
                />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>{LPI_MIN}</span>
                  <span>default {LPI_DEFAULT}</span>
                  <span>{LPI_MAX}</span>
                </div>
              </div>

              <Separator />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-sm text-foreground">
                    Ângulo {mode === "rosette_cmyk"
                      ? "(fixo CMYK)"
                      : mode === "spot_white_cmyk"
                        ? "(rotação global)"
                        : "(grade única)"}
                  </Label>
                  <Input
                    type="number"
                    value={angle}
                    min={ANGLE_MIN}
                    max={ANGLE_MAX}
                    step={1}
                    disabled={busy || mode === "rosette_cmyk"}
                    onChange={(e) => setAngle(parseInt(e.target.value, 10))}
                    className="h-7 w-20 text-right font-mono text-xs"
                  />
                </div>
                <Slider
                  value={[angle]}
                  min={ANGLE_MIN}
                  max={ANGLE_MAX}
                  step={1}
                  disabled={busy || mode === "rosette_cmyk"}
                  onValueChange={([v]) => setAngle(v)}
                />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>{ANGLE_MIN}°</span>
                  <span>
                    {mode === "rosette_cmyk"
                      ? "C15° M75° Y0° K45°"
                      : `default ${ANGLE_DEFAULT}°`}
                  </span>
                  <span>{ANGLE_MAX}°</span>
                </div>
              </div>

              <Separator />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-sm text-foreground">
                    White Threshold {mode !== "spot_white_cmyk" ? "(somente Spot White)" : ""}
                  </Label>
                  <Input
                    type="number"
                    value={whiteThreshold}
                    min={0}
                    max={100}
                    step={1}
                    disabled={busy || mode !== "spot_white_cmyk"}
                    onChange={(e) => setWhiteThreshold(parseInt(e.target.value, 10))}
                    className="h-7 w-20 text-right font-mono text-xs"
                  />
                </div>
                <Slider
                  value={[whiteThreshold]}
                  min={0}
                  max={100}
                  step={1}
                  disabled={busy || mode !== "spot_white_cmyk"}
                  onValueChange={([v]) => setWhiteThreshold(v)}
                />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>0% (mais branca)</span>
                  <span>40% default</span>
                  <span>100% (sem branca)</span>
                </div>
              </div>

              <Separator />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-sm text-foreground">
                    Rosette Intensity {mode !== "hybrid" ? "(somente Hybrid)" : ""}
                  </Label>
                  <Input
                    type="number"
                    value={rosetteIntensity}
                    min={0}
                    max={100}
                    step={1}
                    disabled={busy || mode !== "hybrid"}
                    onChange={(e) => setRosetteIntensity(parseInt(e.target.value, 10))}
                    className="h-7 w-20 text-right font-mono text-xs"
                  />
                </div>
                <Slider
                  value={[rosetteIntensity]}
                  min={0}
                  max={100}
                  step={1}
                  disabled={busy || mode !== "hybrid"}
                  onValueChange={([v]) => setRosetteIntensity(v)}
                />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>0% circular</span>
                  <span>50% mix</span>
                  <span>100% rosette</span>
                </div>
              </div>

              <Separator />

              <div className="rounded-md border border-border/60 bg-background/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Regras DTF:</strong> preto puro (lum&lt;5%) é vazado.
                Spot White desenha base branca onde lum&gt;{whiteThreshold}% e CMYK por cima. Fundo 100% alpha 0.
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={busy}
                onClick={() => setOpts({ ...DEFAULT_OPTIONS, lpi: LPI_DEFAULT })}
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
    <Card
      className={`bg-card/70 p-4 backdrop-blur transition-all ${highlight ? "ring-1 ring-primary shadow-[var(--shadow-glow)]" : ""}`}
    >
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
            <div className="text-xs font-medium text-foreground/80">
              Processando retícula em 300 DPI…
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {stage || "iniciando"} · {pct ?? 0}%
            </div>
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
