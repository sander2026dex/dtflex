import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

const ShirtStudioCanvas = lazy(() => import("./shirt-studio/ShirtStudioCanvas"));

function StudioSkeleton() {
  return (
    <div className="h-[560px] w-full animate-pulse rounded-3xl border border-border bg-card/50" />
  );
}

export function ShirtStudio() {
  return (
    <section id="estudio" className="mx-auto w-full max-w-6xl px-4 py-20">
      <div className="mb-10 text-center">
        <span className="inline-block rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          Novo · Estúdio de personalização
        </span>
        <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Monte sua camisa online</h2>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          Escolha o modelo, a cor do tecido e o lado da peça, posicione a arte livremente dentro da área de impressão e
          exporte o layout em PNG transparente de alta resolução.
        </p>
      </div>
      <ClientOnly fallback={<StudioSkeleton />}>
        <Suspense fallback={<StudioSkeleton />}>
          <ShirtStudioCanvas />
        </Suspense>
      </ClientOnly>
    </section>
  );
}
