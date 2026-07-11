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
      const expired = (session as any)?.expired ? "1" : "";
      const email = session?.email ?? "";
      throw redirect({ to: "/login", search: { code: "", email, expired } });
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
        src="/dtflex-tool/index.html?v=dpi300-a3-v14"
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


