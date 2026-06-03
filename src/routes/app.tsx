import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { getAccessSession, pingAccessSession } from "@/lib/access.functions";
import { BackgroundRemoverDialog } from "@/components/BackgroundRemoverDialog";
import { Button } from "@/components/ui/button";

function AppError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Acesso indisponível</h1>
        <p className="mt-2 text-muted-foreground">Recarregue a página para abrir a ferramenta novamente.</p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "DTFLEXPRO Halftone Engine" },
      { name: "description", content: "Ferramenta profissional DTFLEXPRO Halftone Engine para retículas DTF — Rosette CMYK e Round Clean." },
    ],
  }),
  beforeLoad: async () => {
    const session = await getAccessSession();
    if (!session?.authenticated) {
      throw redirect({ to: "/login", search: { code: "", email: "" } });
    }
  },
  errorComponent: AppError,
  notFoundComponent: AppError,
  component: AppPage,
});

function formatExpiry(iso: string | null): { label: string; tone: "ok" | "warn" | "danger" } {
  if (!iso) return { label: "Acesso vitalício", tone: "ok" };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "Acesso expirado", tone: "danger" };
  const days = Math.floor(ms / 86_400_000);
  // Vitalício = expira muito longe (>10 anos)
  if (days > 3650) return { label: "Acesso vitalício", tone: "ok" };
  const date = new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const tone: "ok" | "warn" | "danger" = days <= 3 ? "danger" : days <= 7 ? "warn" : "ok";
  const restante = days === 0 ? "expira hoje" : days === 1 ? "1 dia restante" : `${days} dias restantes`;
  return { label: `Expira em ${date} · ${restante}`, tone };
}

function AppPage() {
  const ping = useServerFn(pingAccessSession);
  const readSession = useServerFn(getAccessSession);
  const [expiry, setExpiry] = useState<{ email: string | null; expiresAt: string | null } | null>(null);

  // Heartbeat — marca o usuário como online no painel admin
  useEffect(() => {
    ping().catch(() => {});
    const id = setInterval(() => {
      ping().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [ping]);

  // Buscar dados da sessão (e-mail + expiração) para mostrar no topo
  useEffect(() => {
    readSession()
      .then((s) => setExpiry({ email: s.email ?? null, expiresAt: s.expiresAt ?? null }))
      .catch(() => {});
  }, [readSession]);


  // Proteção anti-print: bloqueia PrintScreen, contexto, atalhos de captura
  // e esconde a tela quando o usuário tenta imprimir.
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-dtflex-antiprint", "true");
    styleEl.textContent = `
      @media print {
        html, body { display: none !important; visibility: hidden !important; background: #000 !important; }
      }
      body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      iframe[title="DTFLEXPRO Halftone Engine"] { -webkit-user-select: none; user-select: none; }
    `;
    document.head.appendChild(styleEl);

    const blockContext = (e: MouseEvent) => e.preventDefault();
    const blockKeys = (e: KeyboardEvent) => {
      const k = e.key;
      // PrintScreen
      if (k === "PrintScreen") {
        try { navigator.clipboard.writeText(""); } catch {}
        e.preventDefault();
        alert("Captura de tela bloqueada nesta ferramenta.");
        return;
      }
      // Ctrl/Cmd+P (print), Ctrl/Cmd+S (save), Ctrl+Shift+S (screenshot Firefox)
      if ((e.ctrlKey || e.metaKey) && (k === "p" || k === "P" || k === "s" || k === "S")) {
        e.preventDefault();
        return;
      }
      // Ctrl+Shift+I/J/C (devtools), F12
      if (k === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i","I","j","J","c","C"].includes(k))) {
        e.preventDefault();
        return;
      }
    };
    const beforePrint = () => {
      document.body.style.visibility = "hidden";
    };
    const afterPrint = () => {
      document.body.style.visibility = "";
    };

    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("keydown", blockKeys, true);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);

    return () => {
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("keydown", blockKeys, true);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      styleEl.remove();
    };
  }, []);

  const exp = expiry ? formatExpiry(expiry.expiresAt) : null;
  const toneBg =
    exp?.tone === "danger"
      ? "bg-red-600/95 text-white"
      : exp?.tone === "warn"
        ? "bg-amber-500/95 text-black"
        : "bg-emerald-600/95 text-white";

  return (
    <>
      {exp && (
        <div
          className={`fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-3 px-4 py-1.5 text-xs font-medium shadow ${toneBg}`}
        >
          <span className="truncate">
            {expiry?.email ? `${expiry.email} · ` : ""}
            {exp.label}
          </span>
        </div>
      )}
      {/* Aviso sobre preto absoluto */}
      <div
        className="fixed left-0 right-0 z-40 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold shadow"
        style={{
          top: exp ? 28 : 0,
          background: "#facc15",
          color: "#0f0f0f",
        }}
      >
        <span className="truncate">
          Camisas pretas: o preto precisa ser preto absoluto (RGB 0,0,0) — remova a cor de fundo para não ter sujeira na estampa.
        </span>
      </div>
      <iframe
        src="/dtflex-tool/index.html"
        title="DTFLEXPRO Halftone Engine"
        onLoad={(e) => {
          // Injeta um hook no iframe que limpa o canal alpha em QUALQUER PNG
          // exportado pela ferramenta de halftone (toBlob / toDataURL / download <a>).
          // Resultado: fundo 100% limpo, zero pixels flutuantes, zero ruído alpha.
          try {
            const win = (e.currentTarget as HTMLIFrameElement).contentWindow as any;
            if (!win || win.__dtflexAlphaHookInstalled) return;
            win.__dtflexAlphaHookInstalled = true;

            const cleanAlpha = (data: Uint8ClampedArray, w: number, h: number) => {
              const aThr = 8;
              const minSize = 12;
              const N = w * h;
              for (let i = 0; i < N; i++) if (data[i * 4 + 3] <= aThr) data[i * 4 + 3] = 0;
              const visited = new Uint8Array(N);
              const stack = new Int32Array(N);
              const comp = new Int32Array(N);
              for (let p = 0; p < N; p++) {
                if (visited[p] || data[p * 4 + 3] === 0) continue;
                let top = 0; stack[top++] = p; visited[p] = 1; let count = 0;
                while (top > 0) {
                  const q = stack[--top]; comp[count++] = q;
                  const x = q % w, y = (q / w) | 0;
                  if (x > 0) { const n = q - 1; if (!visited[n] && data[n * 4 + 3] > 0) { visited[n] = 1; stack[top++] = n; } }
                  if (x < w - 1) { const n = q + 1; if (!visited[n] && data[n * 4 + 3] > 0) { visited[n] = 1; stack[top++] = n; } }
                  if (y > 0) { const n = q - w; if (!visited[n] && data[n * 4 + 3] > 0) { visited[n] = 1; stack[top++] = n; } }
                  if (y < h - 1) { const n = q + w; if (!visited[n] && data[n * 4 + 3] > 0) { visited[n] = 1; stack[top++] = n; } }
                }
                if (count < minSize) for (let k = 0; k < count; k++) data[comp[k] * 4 + 3] = 0;
              }
            };

            const cleanCanvas = (canvas: HTMLCanvasElement) => {
              try {
                const ctx = canvas.getContext("2d");
                if (!ctx) return canvas;
                const w = canvas.width, h = canvas.height;
                if (w * h === 0 || w * h > 64_000_000) return canvas;
                const out = (win.document as Document).createElement("canvas");
                out.width = w; out.height = h;
                const octx = out.getContext("2d")!;
                octx.drawImage(canvas, 0, 0);
                const img = octx.getImageData(0, 0, w, h);
                cleanAlpha(img.data, w, h);
                octx.putImageData(img, 0, 0);
                return out;
              } catch { return canvas; }
            };

            const CanvasProto = win.HTMLCanvasElement.prototype;
            const origToBlob = CanvasProto.toBlob;
            const origToDataURL = CanvasProto.toDataURL;

            CanvasProto.toBlob = function (this: HTMLCanvasElement, cb: BlobCallback, type?: string, quality?: any) {
              const mime = (type || "image/png").toLowerCase();
              if (mime !== "image/png") return origToBlob.call(this, cb, type, quality);
              const cleaned = cleanCanvas(this);
              return origToBlob.call(cleaned, cb, type, quality);
            };

            CanvasProto.toDataURL = function (this: HTMLCanvasElement, type?: string, quality?: any) {
              const mime = (type || "image/png").toLowerCase();
              if (mime !== "image/png") return origToDataURL.call(this, type, quality);
              const cleaned = cleanCanvas(this);
              return origToDataURL.call(cleaned, type, quality);
            };
          } catch (err) {
            console.warn("[dtflex] alpha hook não instalado:", err);
          }
        }}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          top: exp ? 56 : 28,
          width: "100vw",
          height: exp ? "calc(100vh - 56px)" : "calc(100vh - 28px)",
          border: "none",
          background: "#0a0c10",
        }}
      />
      {/* Botão flutuante: Preparar Arte para Halftone */}
      <BackgroundRemoverDialog
        trigger={
          <Button
            className="fixed bottom-4 right-4 z-50 h-11 px-5 text-sm shadow-[var(--shadow-glow)] font-semibold"
          >
            <Sparkles className="h-5 w-5" />
            Preparar Arte para Halftone
          </Button>
        }
      />
    </>
  );
}

