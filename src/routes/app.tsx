import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { HalftoneStudio } from "@/components/HalftoneStudio";
import { Button } from "@/components/ui/button";
import { getAccessSession, logoutAccessSession } from "@/lib/access.functions";

function AppError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Acesso indisponível</h1>
        <p className="mt-2 text-muted-foreground">Tente validar seu código novamente.</p>
        <Button asChild className="mt-6">
          <Link to="/login">Voltar ao login</Link>
        </Button>
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
      { name: "description", content: "Área privada da DTFLEXPRO protegida por código de acesso." },
    ],
  }),
  loader: async () => {
    const session = await getAccessSession();
    if (!session.authenticated) {
      throw redirect({ to: "/login" });
    }
    return session;
  },
  errorComponent: AppError,
  notFoundComponent: AppNotFound,
  component: AppPage,
});

function AppPage() {
  const session = Route.useLoaderData();
  const logout = useServerFn(logoutAccessSession);

  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">DTFLEXPRO</p>
            <p className="text-sm text-foreground">Acesso liberado para {session.email}</p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await logout();
              window.location.href = "/login";
            }}
          >
            Sair
          </Button>
        </div>
      </div>
      <HalftoneStudio />
    </div>
  );
}
