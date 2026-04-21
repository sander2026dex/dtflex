import { ArrowDown, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import beforeImage from "@/assets/shark-before.jpg";
import afterImage from "@/assets/landing-demo.jpg";
import { Button } from "@/components/ui/button";

const heroBullets = [
  "Conversão inteligente com leitura de contraste para halftone profissional",
  "Configuração precisa para designers, estúdios e produção de impressão",
  "Arquivo final pronto em cerca de 10 segundos após o processamento",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[var(--gradient-hero)] opacity-80" />
      <div className="mx-auto grid max-w-7xl gap-14 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div className="relative space-y-8 animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card/70 px-3 py-2 text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Halftone profissional para DTF, serigrafia e direção de arte
          </div>

          <div className="space-y-5">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
              Transforme qualquer imagem em arte Halftone profissional em segundos
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
              Conversão inteligente, DPI ajustável e exportação em alta qualidade. Feita para designers,
              artistas e profissionais de impressão que exigem precisão e velocidade.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="shadow-[var(--shadow-glow)]">
              <a href="#precos">
                Ver Planos
                <ArrowDown className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login" search={{ code: "", email: "" }}>
                Acessar Plataforma
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-3 text-sm text-muted-foreground">
            {heroBullets.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-md border border-border/60 bg-card/45 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="leading-6">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative animate-enter">
          <div className="absolute inset-0 -z-10 bg-[var(--gradient-hero)] blur-3xl" />
          <div className="grid gap-4 rounded-lg border border-border/70 bg-card/70 p-4 shadow-[var(--shadow-panel)] backdrop-blur-xl md:grid-cols-2">
            <ShowcaseCard
              title="Antes"
              subtitle="Imagem original"
              src={beforeImage}
              alt="Arte original antes do processamento halftone"
            />
            <ShowcaseCard
              title="Depois"
              subtitle="Resultado halftone"
              src={afterImage}
              alt="Resultado final da imagem em halftone após o processamento"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ShowcaseCard({
  title,
  subtitle,
  src,
  alt,
}: {
  title: string;
  subtitle: string;
  src: string;
  alt: string;
}) {
  return (
    <article className="rounded-md border border-border/70 bg-background/80 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
          <p className="text-sm text-foreground">{subtitle}</p>
        </div>
        <span className="rounded-full border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">Preview real</span>
      </div>
      <div className="aspect-[4/5] overflow-hidden rounded-md border border-border/60 bg-card">
        <img src={src} alt={alt} className="h-full w-full object-cover object-center" loading="eager" />
      </div>
    </article>
  );
}
