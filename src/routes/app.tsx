import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAccessSession } from "@/lib/access.functions";

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
      throw redirect({ to: "/login", search: {} });
    }
  },
  errorComponent: AppError,
  notFoundComponent: AppError,
  component: AppPage,
});

function AppPage() {
  return (
    <iframe
      src="/api/app-tool"
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
