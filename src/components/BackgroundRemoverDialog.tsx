import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, Wand2, Download, Sparkles, Copy, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";

type Props = { trigger: React.ReactNode };

export function BackgroundRemoverDialog({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [tolerance, setTolerance] = useState(32);
  const [deepClean, setDeepClean] = useState(true);
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

  // Paste com Ctrl+V quando o diálogo está aberto
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

  const removeBackground = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 20));

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Cor de fundo = média dos 4 cantos
    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    let br = 0, bg = 0, bb = 0;
    for (const [x, y] of corners) {
      const i = (y * w + x) * 4;
      br += data[i]; bg += data[i + 1]; bb += data[i + 2];
    }
    br = Math.round(br / 4); bg = Math.round(bg / 4); bb = Math.round(bb / 4);

    const tolSq = tolerance * tolerance * 3;

    // Flood-fill a partir das bordas: só remove pixels CONECTADOS ao fundo.
    // Isso garante que cores parecidas DENTRO da arte não viram buracos,
    // e o recorte fica somente onde realmente é fundo.
    const visited = new Uint8Array(w * h);
    const stack: number[] = [];
    const pushIf = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const idx = y * w + x;
      if (visited[idx]) return;
      const i = idx * 4;
      const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
      if (dr * dr + dg * dg + db * db <= tolSq) {
        visited[idx] = 1;
        stack.push(idx);
      }
    };
    for (let x = 0; x < w; x++) { pushIf(x, 0); pushIf(x, h - 1); }
    for (let y = 0; y < h; y++) { pushIf(0, y); pushIf(w - 1, y); }
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % w, y = (idx / w) | 0;
      pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1);
    }

    // Aplica transparência só nos pixels do fundo conectado
    for (let idx = 0; idx < w * h; idx++) {
      if (visited[idx]) data[idx * 4 + 3] = 0;
    }

    if (deepClean) {
      // 1) Erosão de 1px na máscara alpha — mata rebarbas/anti-aliasing nas bordas
      const alphaCopy = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) alphaCopy[i] = data[i * 4 + 3];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (alphaCopy[idx] === 0) continue;
          // se algum vizinho é fundo, zera (erosão)
          const up = y > 0 ? alphaCopy[idx - w] : 0;
          const dn = y < h - 1 ? alphaCopy[idx + w] : 0;
          const lf = x > 0 ? alphaCopy[idx - 1] : 0;
          const rt = x < w - 1 ? alphaCopy[idx + 1] : 0;
          if (up === 0 || dn === 0 || lf === 0 || rt === 0) {
            // não erode totalmente — só remove se também for semi-transparente
            const a = data[idx * 4 + 3];
            if (a < 255) data[idx * 4 + 3] = 0;
          }
        }
      }
      // 2) Anti-sujeira: zera qualquer pixel semi-transparente (1..250 → 0)
      for (let i = 3; i < data.length; i += 4) {
        const a = data[i];
        if (a > 0 && a < 250) data[i] = 0;
        else if (a >= 250) data[i] = 255;
      }
      // 3) Preto absoluto: pixels muito escuros viram (0,0,0) puros
      const blackThresh = 22;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r < blackThresh && g < blackThresh && b < blackThresh) {
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (blob) {
      setResultBlob(blob);
      const out = URL.createObjectURL(blob);
      setResultUrl(out);
    }
    setProcessing(false);
  }, [tolerance, deepClean]);

  const save = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "arte-halftone.png";
    a.click();
  };

  const copyResult = async () => {
    if (!resultBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": resultBlob })]);
      toast.success("Imagem copiada — cole na ferramenta com Ctrl+V.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Preparar Arte para Halftone — Camisa Preta
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
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
                title="Colar imagem da área de transferência (Ctrl+V)"
              >
                <ClipboardPaste className="h-5 w-5" />
                <span className="text-[11px]">Colar</span>
              </Button>
            </div>

            <div className="space-y-4 rounded-lg border border-border bg-card/40 p-4">
              <p className="text-sm font-semibold">Configurações</p>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Tolerância do fundo</span>
                  <span className="text-muted-foreground">{tolerance}</span>
                </div>
                <Slider value={[tolerance]} min={5} max={120} step={1} onValueChange={(v) => setTolerance(v[0])} />
              </div>

              <label className="flex items-start gap-2 text-xs">
                <Checkbox checked={deepClean} onCheckedChange={(v) => setDeepClean(Boolean(v))} className="mt-0.5" />
                <span>
                  <span className="font-semibold">Limpeza profunda</span>
                  <span className="block text-muted-foreground">
                    Preto absoluto (#000000) + anti-sujeira (sem pixels mortos nas bordas)
                  </span>
                </span>
              </label>

              <div className="flex flex-col gap-2">
                <Button onClick={removeBackground} disabled={!originalUrl || processing} className="w-full">
                  <Wand2 className="h-4 w-4" />
                  {processing ? "Processando..." : "Remover Fundo"}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={save} disabled={!resultUrl} variant="outline">
                    <Download className="h-4 w-4" />
                    Salvar
                  </Button>
                  <Button onClick={copyResult} disabled={!resultBlob} variant="outline">
                    <Copy className="h-4 w-4" />
                    Copiar
                  </Button>
                </div>
              </div>
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
