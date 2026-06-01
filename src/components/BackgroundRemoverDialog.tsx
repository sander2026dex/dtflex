import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Upload, Wand2, Download, Sparkles, Copy, ClipboardPaste, Shirt } from "lucide-react";
import { toast } from "sonner";
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

type Props = { trigger: React.ReactNode };

type Mode = "remove" | "black";

export function BackgroundRemoverDialog({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("remove");

  // Remoção de fundo (IA)
  const [progress, setProgress] = useState(0);


  // Fundo preto absoluto
  const [blackThresh, setBlackThresh] = useState(22);

  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem.");
      return;
    }
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    setResultUrl(null);
    setResultBlob(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handlePaste = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          handleFile(new File([blob], "colado.png", { type }));
          toast.success("Imagem colada.");
          return;
        }
      }
      toast.error("Nenhuma imagem na área de transferência.");
    } catch {
      toast.error("Não foi possível colar. Permita acesso à área de transferência.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPasteEv = (e: ClipboardEvent) => {
      const f = e.clipboardData?.files?.[0];
      if (f && f.type.startsWith("image/")) {
        e.preventDefault();
        handleFile(f);
      }
    };
    window.addEventListener("paste", onPasteEv);
    return () => window.removeEventListener("paste", onPasteEv);
  }, [open]);

  const getCanvasFromImg = () => {
    const img = imgRef.current;
    if (!img || !img.complete) return null;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return { canvas, ctx, w, h };
  };

  const finalize = async (canvas: HTMLCanvasElement) => {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (blob) {
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    }
  };

  // ============ 1) REMOVER FUNDO (IA — preserva cabelo, dedos, transparências) ============
  const removeBackground = useCallback(async () => {
    if (!originalUrl) return;
    setProcessing(true);
    setProgress(0);
    try {
      const blob = await imglyRemoveBackground(originalUrl, {
        output: { format: "image/png", quality: 1 },
        progress: (_key, current, total) => {
          setProgress(Math.round((current / total) * 100));
        },
      });
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
      toast.success("Fundo removido com preservação total dos detalhes.");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao remover fundo.");
    } finally {
      setProcessing(false);
    }
  }, [originalUrl]);


  // ============ 2) FUNDO PRETO ABSOLUTO (camisa preta) ============
  const makeBlackBackground = useCallback(async () => {
    const ref = getCanvasFromImg();
    if (!ref) return;
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 20));
    const { canvas, ctx, w, h } = ref;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Força pretos quase-puros a (0,0,0) absoluto e remove canal alpha (fundo preto opaco)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      // Compõe sobre preto: se alpha < 255, mistura com preto
      if (a < 255) {
        const k = a / 255;
        data[i] = Math.round(r * k);
        data[i + 1] = Math.round(g * k);
        data[i + 2] = Math.round(b * k);
        data[i + 3] = 255;
      }
      // Pretos imperfeitos viram preto absoluto
      if (data[i] < blackThresh && data[i + 1] < blackThresh && data[i + 2] < blackThresh) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    await finalize(canvas);
    setProcessing(false);
  }, [blackThresh]);

  const save = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = mode === "remove" ? "sem-fundo.png" : "fundo-preto.png";
    a.click();
  };

  const copyResult = async () => {
    if (!resultBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": resultBlob })]);
      toast.success("Copiado! Cole na ferramenta de halftone com Ctrl+V.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const run = mode === "remove" ? removeBackground : makeBlackBackground;
  const runLabel = mode === "remove" ? "Remover Fundo" : "Aplicar Fundo Preto";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Preparar Arte para Halftone
          </DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setResultUrl(null); setResultBlob(null); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="remove" className="gap-2">
              <Wand2 className="h-4 w-4" />
              Remover Fundo
            </TabsTrigger>
            <TabsTrigger value="black" className="gap-2">
              <Shirt className="h-4 w-4" />
              Fundo Preto Absoluto
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 grid gap-6 md:grid-cols-[1fr_1.4fr]">
            <div className="space-y-4">
              <div className="flex gap-2">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-card/40 p-5 text-center hover:border-primary"
                >
                  <Upload className="h-7 w-7 text-primary" />
                  <p className="text-sm font-medium">Arraste ou clique</p>
                  <p className="text-[11px] text-muted-foreground">PNG, JPG, WEBP</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePaste}
                  className="h-auto flex-col gap-1 px-3"
                  title="Colar imagem (Ctrl+V)"
                >
                  <ClipboardPaste className="h-5 w-5" />
                  <span className="text-[11px]">Colar</span>
                </Button>
              </div>

              <TabsContent value="remove" className="m-0 space-y-4 rounded-lg border border-border bg-card/40 p-4">
                <p className="text-sm font-semibold">Remoção inteligente</p>
                <p className="text-[11px] text-muted-foreground">
                  Recorta apenas o fundo conectado às bordas — preserva detalhes dentro de letras e furos da arte.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Tolerância</span>
                    <span className="text-muted-foreground">{tolerance}</span>
                  </div>
                  <Slider value={[tolerance]} min={5} max={120} step={1} onValueChange={(v) => setTolerance(v[0])} />
                </div>
                <label className="flex items-start gap-2 text-xs">
                  <Checkbox checked={cleanEdges} onCheckedChange={(v) => setCleanEdges(Boolean(v))} className="mt-0.5" />
                  <span>
                    <span className="font-semibold">Limpar rebarbas das bordas</span>
                    <span className="block text-muted-foreground">
                      Remove anti-aliasing e pixels semi-transparentes — sem sujeira no halftone.
                    </span>
                  </span>
                </label>
              </TabsContent>

              <TabsContent value="black" className="m-0 space-y-4 rounded-lg border border-border bg-card/40 p-4">
                <p className="text-sm font-semibold">Fundo preto absoluto</p>
                <p className="text-[11px] text-muted-foreground">
                  Compõe a arte sobre preto puro (#000000) — ideal para camisa preta. Pretos imperfeitos viram preto absoluto.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Limite de preto</span>
                    <span className="text-muted-foreground">{blackThresh}</span>
                  </div>
                  <Slider value={[blackThresh]} min={0} max={60} step={1} onValueChange={(v) => setBlackThresh(v[0])} />
                </div>
              </TabsContent>

              <div className="flex flex-col gap-2">
                <Button onClick={run} disabled={!originalUrl || processing} className="w-full">
                  <Wand2 className="h-4 w-4" />
                  {processing ? "Processando..." : runLabel}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={save} disabled={!resultUrl} variant="outline">
                    <Download className="h-4 w-4" />
                    Salvar
                  </Button>
                  <Button onClick={copyResult} disabled={!resultBlob} variant="outline">
                    <Copy className="h-4 w-4" />
                    Copiar p/ Halftone
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Copie e cole (Ctrl+V) dentro da ferramenta de halftone para continuar.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {!originalUrl ? (
                <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-border bg-card/30 text-sm text-muted-foreground">
                  Envie ou cole uma imagem para começar
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
                    <div className={`mt-1 overflow-hidden rounded-md border border-border ${mode === "black" ? "bg-black" : "bg-[conic-gradient(#e5e5e5_0_25%,#fff_0_50%,#e5e5e5_0_75%,#fff_0)] bg-[length:16px_16px]"}`}>
                      {resultUrl ? (
                        <img src={resultUrl} alt="Resultado" className="h-64 w-full object-contain" />
                      ) : (
                        <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                          Clique em "{runLabel}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
