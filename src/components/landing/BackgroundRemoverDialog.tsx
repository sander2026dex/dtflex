import { useCallback, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, Wand2, Download, Sparkles } from "lucide-react";

type Props = { trigger: React.ReactNode };

export function BackgroundRemoverDialog({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [tolerance, setTolerance] = useState(30);
  const [feather, setFeather] = useState(1);
  const [antiDirt, setAntiDirt] = useState(true);
  const [pureBlack, setPureBlack] = useState(false);
  const [transparent, setTransparent] = useState(true);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    setResultUrl(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const removeBackground = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 30));

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    // Sample corner pixels to determine background color (average)
    const corners = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ];
    let br = 0, bg = 0, bb = 0;
    for (const [x, y] of corners) {
      const i = (y * w + x) * 4;
      br += data[i];
      bg += data[i + 1];
      bb += data[i + 2];
    }
    br = Math.round(br / 4);
    bg = Math.round(bg / 4);
    bb = Math.round(bb / 4);

    const tol = tolerance;
    const tolSq = tol * tol * 3;

    // Pure black enforcement
    const blackThresh = 18;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];

      if (pureBlack && r < blackThresh && g < blackThresh && b < blackThresh) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
        continue;
      }

      const dr = r - br, dg = g - bg, db = b - bb;
      const distSq = dr * dr + dg * dg + db * db;

      if (distSq <= tolSq) {
        if (transparent) data[i + 3] = 0;
        else { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255; }
      } else if (transparent && distSq <= tolSq * 4) {
        // edge feather
        const t = Math.sqrt(distSq) / (Math.sqrt(tolSq) * 2);
        const alpha = Math.min(255, Math.round(255 * t * feather));
        data[i + 3] = alpha;
      }
    }

    // Anti-dirt: kill semi-transparent pixels (1..250 → 0)
    if (antiDirt && transparent) {
      for (let i = 3; i < data.length; i += 4) {
        const a = data[i];
        if (a > 0 && a < 250) data[i] = 0;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const out = canvas.toDataURL("image/png");
    setResultUrl(out);
    setProcessing(false);
  }, [tolerance, feather, antiDirt, pureBlack, transparent]);

  const save = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "imagem-sem-fundo.png";
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Removedor de Fundo Inteligente — Grátis
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card/40 p-6 text-center hover:border-primary"
            >
              <Upload className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium">Arraste ou clique para enviar</p>
              <p className="text-xs text-muted-foreground">PNG, JPG, WEBP</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            <div className="space-y-4 rounded-lg border border-border bg-card/40 p-4">
              <p className="text-sm font-semibold">Configurações</p>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Tolerância</span>
                  <span className="text-muted-foreground">{tolerance}</span>
                </div>
                <Slider value={[tolerance]} min={0} max={150} step={1} onValueChange={(v) => setTolerance(v[0])} />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Suavização de Bordas</span>
                  <span className="text-muted-foreground">{feather.toFixed(1)}</span>
                </div>
                <Slider value={[feather]} min={0} max={3} step={0.1} onValueChange={(v) => setFeather(v[0])} />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={antiDirt} onCheckedChange={(v) => setAntiDirt(Boolean(v))} />
                  Anti-sujeira (limpar artefatos)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={pureBlack} onCheckedChange={(v) => setPureBlack(Boolean(v))} />
                  Fundo preto 100% puro (#000000)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={transparent} onCheckedChange={(v) => setTransparent(Boolean(v))} />
                  Fundo transparente
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <Button onClick={removeBackground} disabled={!originalUrl || processing} className="w-full">
                  <Wand2 className="h-4 w-4" />
                  {processing ? "Processando..." : "Remover Fundo"}
                </Button>
                <Button onClick={save} disabled={!resultUrl} variant="outline" className="w-full">
                  <Download className="h-4 w-4" />
                  Salvar Imagem
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {!originalUrl ? (
              <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-border bg-card/30 text-sm text-muted-foreground">
                Envie uma imagem para começar
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Original</Label>
                  <div className="mt-1 overflow-hidden rounded-md border border-border bg-[conic-gradient(#e5e5e5_0_25%,#fff_0_50%,#e5e5e5_0_75%,#fff_0)] bg-[length:16px_16px]">
                    <img
                      ref={imgRef}
                      src={originalUrl}
                      alt="Original"
                      crossOrigin="anonymous"
                      className="h-64 w-full object-contain"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Resultado</Label>
                  <div className="mt-1 overflow-hidden rounded-md border border-border bg-[conic-gradient(#e5e5e5_0_25%,#fff_0_50%,#e5e5e5_0_75%,#fff_0)] bg-[length:16px_16px]">
                    {resultUrl ? (
                      <img src={resultUrl} alt="Resultado" className="h-64 w-full object-contain" />
                    ) : (
                      <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                        Clique em "Remover Fundo"
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
