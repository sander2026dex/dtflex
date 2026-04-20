import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock3, Download, ImageIcon, Layers3, Loader2, Settings2, ShieldCheck, Sparkles, Upload } from "lucide-react";
import demoImage from "@/assets/landing-demo.jpg";
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

const demoDefaults: HalftoneOptions = {
  ...DEFAULT_OPTIONS,
  halftoneType: "rosette_cmyk",
  lpi: 35,
  bgTolerance: 28,
  featherPx: 8,
};

export function HalftoneStudio() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<ProcessedResult | null>(null);
  const [fullResult, setFullResult] = useState<ProcessedResult | null>(null);
  const [demoProcessedUrl, setDemoProcessedUrl] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(true);
  const [stage, setStage] = useState("");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<HalftoneOptions>({
    ...DEFAULT_OPTIONS,
    halftoneType: "circular",
  });
  const [livePreview, setLivePreview] = useState(false);
  const studioRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cachedImg = useRef<HTMLImageElement | null>(null);
  const previewTimer = useRef<number | null>(null);
  const previewRunId = useRef(0);

  useEffect(() => {
    let active = true;
    let demoUrl: string | null = null;

    async function buildDemo() {
      try {
        const response = await fetch(demoImage);
        const blob = await response.blob();
        const file = new File([blob], "demo.jpg", { type: blob.type || "image/jpeg" });
        const image = await loadImage(file);
        const processed = await processImage(image, demoDefaults, undefined, 900);
        if (!active) return;
        demoUrl = URL.createObjectURL(processed);
        setDemoProcessedUrl(demoUrl);
      } finally {
        if (active) setDemoLoading(false);
      }
    }

    buildDemo();

    return () => {
      active = false;
      if (demoUrl) URL.revokeObjectURL(demoUrl);
    };
  }, []);

  const scrollToStudio = useCallback(() => {
    studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
        <section className="border-b border-border/60">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-16">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Halftone CMYK profissional
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                  Plataforma profissional para gerar retícula real com fundo vazado.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                  Circular e Rosette CMYK com ângulos clássicos 15° · 75° · 0° · 45°, PNG 300 DPI, preto vazado e pontos reais prontos para venda em escala.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={scrollToStudio} className="shadow-[var(--shadow-glow)]">
                  Testar a ferramenta
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#planos">Ver planos</a>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  "Preto sólido vira transparência",
                  "Rosette CMYK real de pré-impressão",
                  "Exportação pronta em PNG 300 DPI",
                ].map((item) => (
                  <div key={item} className="rounded-lg border border-border bg-card/50 px-4 py-3 text-sm text-foreground backdrop-blur">
                    <div className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-primary" />
                      <span>{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/60 p-4 shadow-[var(--shadow-panel)] backdrop-blur">
              <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <span>Antes e depois</span>
                <span>Demo real</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ShowcaseImage title="Original" src={demoImage} alt="Imagem original de demonstração da plataforma" loading="eager" />
                <ShowcaseImage
                  title="Rosette CMYK"
                  src={demoProcessedUrl}
                  alt="Exemplo processado em retícula Rosette CMYK"
                  busy={demoLoading}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border/60">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <div className="grid gap-4 md:grid-cols-3">
              <FeatureBand
                icon={Layers3}
                title="Retícula de verdade"
                copy="A saída usa células reais de impressão, com pontos sólidos e separação profissional por chapa."
              />
              <FeatureBand
                icon={Clock3}
                title="Fluxo otimizado"
                copy="Preview sob demanda e pipeline mais leve para reduzir o tempo de processamento do usuário final."
              />
              <FeatureBand
                icon={ShieldCheck}
                title="Pronto para SaaS"
                copy="Landing comercial, posicionamento premium e base pronta para sua operação vender a plataforma."
              />
            </div>
          </div>
        </section>

        <section ref={studioRef} id="studio" className="mx-auto max-w-7xl px-6 py-10">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary shadow-[var(--shadow-glow)]">
                  <ImageIcon className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Ferramenta DTFLEX Pro
                </span>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Gerador de retícula profissional
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Escolha Circular ou Rosette CMYK, envie a arte e exporte com transparência real entre os pontos.
              </p>
            </div>
            <div className="rounded-md border border-border bg-card/50 px-4 py-2 text-sm backdrop-blur">
              <span className="text-muted-foreground">Saída alvo </span>
              <span className="font-mono text-primary">3307 × 4961 px · 300 DPI</span>
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
                          ? `${fullResult.sizeKB} KB · 3307×4961`
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

              <div>
                <Label className="mb-2 block text-sm text-foreground">Tipo de retícula</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={opts.halftoneType === "circular" ? "default" : "outline"}
                    onClick={() => setOpts((o) => ({ ...o, halftoneType: "circular" }))}
                  >
                    Circular
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={opts.halftoneType === "rosette_cmyk" ? "default" : "outline"}
                    onClick={() => setOpts((o) => ({ ...o, halftoneType: "rosette_cmyk" }))}
                  >
                    Rosette CMYK
                  </Button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  {opts.halftoneType === "rosette_cmyk"
                    ? "Separação real C/M/Y/K com ângulos 15° · 75° · 0° · 45° e fundo vazado."
                    : "Retícula AM circular com pontos sólidos da cor original e preto vazado."}
                </p>
              </div>

              <SliderRow
                label="LPI (frequência)"
                value={opts.lpi ?? 35}
                min={20}
                max={80}
                step={1}
                onChange={(v) => setOpts((o) => ({ ...o, lpi: v }))}
              />
              {opts.halftoneType === "circular" && (
                <SliderRow
                  label="Ângulo da malha (°)"
                  value={opts.angleDeg ?? 22}
                  min={0}
                  max={90}
                  step={1}
                  onChange={(v) => setOpts((o) => ({ ...o, angleDeg: v }))}
                />
              )}
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
                value={opts.featherPx ?? 3}
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
                value={opts.unsharpAmount ?? 0.6}
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
                onClick={() => setOpts({ ...DEFAULT_OPTIONS, halftoneType: "circular" })}
              >
                Resetar parâmetros
              </Button>
            </Card>
          </div>
        </section>

        <section id="planos" className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <div className="mb-6 max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">Planos para vender sua operação</h2>
              <p className="mt-2 text-muted-foreground">
                Estrutura comercial pronta para assinatura SaaS com foco em volume, qualidade de saída e posicionamento premium.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <PricingCard
                title="Mensal"
                price="R$ 47"
                cadence="/mês"
                items={[
                  "Circular + Rosette CMYK",
                  "PNG 300 DPI com transparência",
                  "Preview e exportação profissional",
                ]}
              />
              <PricingCard
                title="Anual"
                price="R$ 168,90"
                cadence="/ano"
                featured
                items={[
                  "Melhor custo para escala",
                  "Mesma engine profissional",
                  "Base pronta para automação comercial",
                ]}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FeatureBand({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof Sparkles;
  title: string;
  copy: string;
}) {
  return (
    <Card className="rounded-lg bg-card/50 p-5 backdrop-blur">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-foreground">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
    </Card>
  );
}

function ShowcaseImage({
  title,
  src,
  alt,
  busy,
  loading = "lazy",
}: {
  title: string;
  src: string | null;
  alt: string;
  busy?: boolean;
  loading?: "lazy" | "eager";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</div>
      <div className="aspect-[4/5] overflow-hidden rounded-md border border-border bg-card">
        {busy ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : src ? (
          <img
            src={src}
            alt={alt}
            loading={loading}
            width={1080}
            height={1350}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando preview</div>
        )}
      </div>
    </div>
  );
}

function PricingCard({
  title,
  price,
  cadence,
  items,
  featured,
}: {
  title: string;
  price: string;
  cadence: string;
  items: string[];
  featured?: boolean;
}) {
  return (
    <Card className={`rounded-lg p-6 ${featured ? "border-primary shadow-[var(--shadow-glow)]" : "bg-card/50"}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-medium text-foreground">{title}</h3>
        {featured && <span className="rounded-md bg-secondary px-3 py-1 text-xs text-foreground">Mais vantajoso</span>}
      </div>
      <div className="mb-5">
        <span className="text-4xl font-semibold text-foreground">{price}</span>
        <span className="ml-2 text-muted-foreground">{cadence}</span>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 text-primary" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Card>
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
