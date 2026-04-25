import { createFileRoute } from "@tanstack/react-router";
import { HalftoneStudio } from "@/components/HalftoneStudio";

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

function AppNotFound() {
  return <AppError />;
}

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "DTFLEXPRO | Área da plataforma" },
      { name: "description", content: "Ferramenta profissional DTFLEXPRO Halftone Engine para retículas DTF." },
    ],
  }),
  errorComponent: AppError,
  notFoundComponent: AppNotFound,
  component: AppPage,
});

function AppPage() {
  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">DTFLEXPRO</p>
            <p className="text-sm text-foreground">Halftone Engine profissional</p>
          </div>
        </div>
      </div>
      <HalftoneStudio />
    </div>
  );
}
