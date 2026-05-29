import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getAccessSession, pingAccessSession } from "@/lib/access.functions";

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

  return (
    <iframe
      src="/dtflex-tool/index.html"
      title="DTFLEXPRO Halftone Engine"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        border: "none",
        background: "#0a0c10",
      }}
    />
  );
}
