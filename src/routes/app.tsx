import { useEffect, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, Calculator, Scissors, ArrowLeft, Wand2 } from "lucide-react";
import { getAccessSession, pingAccessSession, logoutAccessSession } from "@/lib/access.functions";
import { DTFCalculatorDialog } from "@/components/DTFCalculatorDialog";
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

function formatExpiry(iso: string | null): { label: string; tone: "ok" | "warn" | "danger"; daysLeft: number | null } {
  if (!iso) return { label: "Acesso vitalício", tone: "ok", daysLeft: null };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "Acesso expirado", tone: "danger", daysLeft: 0 };
  const days = Math.floor(ms / 86_400_000);
  // Vitalício = expira muito longe (>10 anos)
  if (days > 3650) return { label: "Acesso vitalício", tone: "ok", daysLeft: null };
  const date = new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const tone: "ok" | "warn" | "danger" = days <= 3 ? "danger" : days <= 7 ? "warn" : "ok";
  const restante = days === 0 ? "expira hoje" : days === 1 ? "1 dia restante" : `${days} dias restantes`;
  return { label: `Expira em ${date} · ${restante}`, tone, daysLeft: days };
}

const ADMIN_WHATSAPP = "5511943152441";

function AppPage() {
  const ping = useServerFn(pingAccessSession);
  const readSession = useServerFn(getAccessSession);
  const logout = useServerFn(logoutAccessSession);
  const [expiry, setExpiry] = useState<{ email: string | null; expiresAt: string | null } | null>(null);
  const [showRemover, setShowRemover] = useState(false);
  const [showVtracer, setShowVtracer] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  async function handleLogout() {
    try {
      await logout();
    } catch {}
    window.location.href = "/login";
  }

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

  const showRenewBanner = exp ? exp.tone === "warn" || exp.tone === "danger" : false;
  const renewMsg = encodeURIComponent(
    `Olá! Sou ${expiry?.email ?? ""} e quero renovar meu acesso ao DTFlexPRO. ${exp?.label ?? ""}`,
  );
  const topOffset = (exp ? 28 : 0) + (showRenewBanner ? 36 : 0);

  return (
    <>
      {exp && (
        <div
          className={`fixed left-0 right-0 top-0 z-50 flex items-center justify-between gap-3 px-4 py-1.5 text-xs font-medium shadow ${toneBg}`}
        >
          <span className="truncate">
            {expiry?.email ? `${expiry.email} · ` : ""}
            {exp.label}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="flex shrink-0 items-center gap-1 rounded-md bg-black/30 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide hover:bg-black/50"
          >
            <LogOut className="h-3 w-3" />
            Sair
          </button>
        </div>
      )}
      {showRenewBanner && (
        <div
          className="fixed left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-1.5 text-xs font-semibold shadow bg-amber-500 text-black"
          style={{ top: 28 }}
        >
          <span className="truncate">
            ⚠️ Seu acesso está {exp?.tone === "danger" ? "expirado/quase expirando" : "perto de expirar"}. Entre em contato com o administrador para renovar.
          </span>
          <a
            href={`https://wa.me/${ADMIN_WHATSAPP}?text=${renewMsg}`}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 rounded-md bg-black/80 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-black"
          >
            Renovar pelo WhatsApp
          </a>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/dtflex-tool/index.html?v=dpi300-a3-v12"
        title="DTFLEXPRO Halftone Engine"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          top: topOffset,
          width: "100vw",
          height: `calc(100vh - ${topOffset}px)`,
          border: "none",
          background: "#0a0c10",
        }}
      />
      {/* Botões flutuantes: ferramentas auxiliares */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-wrap items-center justify-end gap-2">
        <Button
          className="h-11 px-4 text-sm font-semibold shadow-lg bg-[oklch(0.58_0.25_27)] hover:bg-[oklch(0.52_0.25_27)] text-white"
          onClick={() => setShowRemover(true)}
        >
          <Scissors className="h-5 w-5" />
          Removedor de fundos
        </Button>
        <Button
          className="h-11 px-4 text-sm font-semibold shadow-lg bg-[oklch(0.55_0.18_260)] hover:bg-[oklch(0.48_0.18_260)] text-white"
          onClick={() => setShowVtracer(true)}
        >
          <Wand2 className="h-5 w-5" />
          Vetorizar (VTracer)
        </Button>
        <DTFCalculatorDialog
          trigger={
            <Button variant="secondary" className="h-11 px-4 text-sm font-semibold shadow-lg">
              <Calculator className="h-5 w-5" />
              Calculadora DTF
            </Button>
          }
        />
      </div>

      {/* Overlay do Removedor de Fundos */}
      {showRemover && (
        <ExternalToolOverlay
          title="Removedor de fundos"
          src="https://www.photoroom.com/pt-pt/tools/background-remover"
          offsetTop={88}
          onClose={() => setShowRemover(false)}
        />
      )}

      {/* Overlay do VTracer */}
      {showVtracer && (
        <ExternalToolOverlay
          title="Vetorizar — VTracer"
          src="https://www.visioncortex.org/vtracer/"
          offsetTop={64}
          onClose={() => setShowVtracer(false)}
        />
      )}
    </>
  );
}


  onClose,
  iframeRef,
}: {
  onClose: () => void;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const [prompt, setPrompt] = useState("");
  const [hexColor, setHexColor] = useState("#111111");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function startMic() {
    const w = window as any;
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) {
      setErr("Reconhecimento de voz não suportado neste navegador.");
      return;
    }
    try {
      const r = new Rec();
      r.lang = "pt-BR";
      r.interimResults = false;
      r.maxAlternatives = 1;
      setRecording(true);
      r.onresult = (ev: any) => setPrompt(ev.results[0][0].transcript);
      r.onend = () => setRecording(false);
      r.onerror = () => setRecording(false);
      r.start();
    } catch {
      setRecording(false);
    }
  }

  // Pede a arte atual à ferramenta (via postMessage)
  function requestArt(): Promise<string> {
    return new Promise((resolve, reject) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return reject(new Error("Ferramenta não carregada."));
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("Timeout: sem resposta da ferramenta."));
      }, 4000);
      function handler(ev: MessageEvent) {
        const d: any = ev.data;
        if (!d || d.type !== "DTF_ART_DATA") return;
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
        if (d.error) reject(new Error(d.error));
        else if (d.dataUrl) resolve(d.dataUrl as string);
        else reject(new Error("Arte não disponível."));
      }
      window.addEventListener("message", handler);
      win.postMessage({ type: "DTF_GET_ART" }, "*");
    });
  }

  async function run() {
    setErr(null);
    setPreviewUrl(null);
    setLoading(true);
    try {
      setMsg("📸 Capturando arte da ferramenta…");
      const imageDataUrl = await requestArt();
      setMsg("🧠 IA adaptando para a cor da camisa…");
      const res = await fetch("/api/public/adapt-shirt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), hexColor, imageDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.imageDataUrl) throw new Error("IA não retornou imagem.");
      setPreviewUrl(data.imageDataUrl);
      setMsg(`✓ Adaptada para camisa ${data.shirtColor || hexColor}. Baixando…`);
      // Envia para a ferramenta baixar (mantém o fluxo dentro do iframe)
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "DTF_DOWNLOAD_ADAPTED",
          dataUrl: data.imageDataUrl,
          filename: `dtflex-camisa-${hexColor.replace("#", "")}.png`,
        },
        "*",
      );
    } catch (e: any) {
      setErr(e?.message || "falha na IA");
      setMsg(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-slate-100 shadow-2xl border border-slate-700">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold">IA por cor da camisa</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          A IA pega a arte já gerada na ferramenta e adapta contraste, halos e base para ficar perfeita na cor da camisa escolhida.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Cor da camisa</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={hexColor}
                onChange={(e) => setHexColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-slate-600 bg-slate-950"
                disabled={loading}
              />
              <input
                type="text"
                value={hexColor}
                onChange={(e) => setHexColor(e.target.value)}
                placeholder="#111111"
                className="w-32 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100"
                disabled={loading}
              />
              <div className="ml-2 flex flex-wrap gap-1">
                {["#000000", "#ffffff", "#6b7280", "#7f1d1d", "#1e3a8a", "#065f46", "#78350f"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setHexColor(c)}
                    className="h-7 w-7 rounded border-2 border-slate-600 hover:border-emerald-400"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Observações (opcional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && run()}
                placeholder="Ex.: camisa preta algodão, reforçar contraste"
                className="flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                disabled={loading}
              />
              <button
                type="button"
                onClick={startMic}
                title="Falar"
                className={`rounded-lg border border-slate-600 px-3 ${recording ? "bg-red-500 text-white" : "bg-slate-950 text-slate-100 hover:bg-slate-800"}`}
              >
                <Mic className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {msg && <div className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{msg}</div>}
        {err && <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">✗ {err}</div>}

        {previewUrl && (
          <div className="mt-3 rounded-lg border border-slate-700 p-2" style={{ background: hexColor }}>
            <img src={previewUrl} alt="Prévia adaptada" className="mx-auto max-h-64" />
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800">
            Fechar
          </Button>
          <Button
            onClick={run}
            disabled={loading}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "Processando…" : "Adaptar e baixar"}
          </Button>
        </div>
      </div>
    </div>
  );
}



function ExternalToolOverlay({
  title,
  src,
  offsetTop,
  onClose,
}: {
  title: string;
  src: string;
  offsetTop: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-white">
        <Button variant="outline" size="sm" className="gap-1 font-semibold" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para ferramenta
        </Button>
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className="w-20" />
      </div>
      <div className="relative flex-1 w-full overflow-hidden bg-white">
        <iframe
          src={src}
          title={title}
          style={{
            position: "absolute",
            left: 0,
            top: -offsetTop,
            width: "100%",
            height: `calc(100% + ${offsetTop}px)`,
            border: "none",
          }}
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        />
      </div>
    </div>
  );
}


