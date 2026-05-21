import { ArrowDown, ArrowUpRight, CheckCircle2, Trophy, Zap, Cpu } from "lucide-react";
import { Link } from "@tanstack/react-router";

import beforeImage from "@/assets/tubarrao-demo.png";
import { Button } from "@/components/ui/button";

const heroBullets = [
  "Tempo de processamento: apenas 288 ms por arte",
  "Chega de gastar memória com software pesado — roda direto no navegador",
  "Crie seus próprios pacotes de estampas em série, sem travar o PC",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[var(--gradient-hero)] opacity-90" />
      {/* World Cup decorative stripes */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 flex">
        <div className="flex-1 bg-[oklch(0.62_0.22_150)]" />
        <div className="flex-1 bg-[oklch(0.85_0.20_95)]" />
        <div className="flex-1 bg-[oklch(0.55_0.20_260)]" />
        <div className="flex-1 bg-[oklch(0.98_0.02_110)]" />
      </div>
      {/* Soccer ball pattern accent */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-64 w-64 rounded-full border-[6px] border-secondary/30 opacity-30 blur-sm" />
      <div className="pointer-events-none absolute bottom-10 -left-16 h-48 w-48 rounded-full border-[4px] border-primary/30 opacity-40" />

      <div className="mx-auto grid max-w-7xl gap-14 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div className="relative space-y-8 animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-secondary/60 bg-secondary/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-secondary shadow-[var(--shadow-glow)]">
            <Trophy className="h-4 w-4" />
            Edição Copa do Mundo • Halftone em 288ms
          </div>

          <div className="space-y-5">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
              Transforme qualquer imagem em arte Halftone profissional em{" "}
              <span className="bg-gradient-to-r from-[oklch(0.85_0.20_95)] via-[oklch(0.72_0.22_145)] to-[oklch(0.85_0.20_95)] bg-clip-text text-transparent">
                288 milissegundos
              </span>
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
              Chega de gastar memória com software pesado. Crie seus próprios pacotes de estampas DTF
              direto no navegador, com a velocidade que a temporada da Copa exige. Precisão de estúdio,
              leveza de um clique.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="shadow-[var(--shadow-glow)] font-semibold">
              <a href="#precos">
                Garantir Meu Plano
                <ArrowDown className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-secondary/60 text-secondary hover:bg-secondary/10">
              <Link to="/login" search={{ code: "", email: "" }}>
                Acessar Plataforma
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Quick stats — World Cup scoreboard style */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-secondary/40 bg-card/60 px-4 py-3 text-center">
              <Zap className="mx-auto mb-1 h-4 w-4 text-secondary" />
              <p className="text-lg font-bold text-secondary">288<span className="text-xs">ms</span></p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Processamento</p>
            </div>
            <div className="rounded-md border border-primary/40 bg-card/60 px-4 py-3 text-center">
              <Cpu className="mx-auto mb-1 h-4 w-4 text-brand" />
              <p className="text-lg font-bold text-brand">0%</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Peso no PC</p>
            </div>
            <div className="rounded-md border border-secondary/40 bg-card/60 px-4 py-3 text-center">
              <Trophy className="mx-auto mb-1 h-4 w-4 text-secondary" />
              <p className="text-lg font-bold text-secondary">∞</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pacotes</p>
            </div>
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
          <div className="rounded-lg border border-secondary/50 bg-card/70 p-4 shadow-[var(--shadow-panel)] backdrop-blur-xl">
            <ShowcaseCard
              title="Antes"
              subtitle="Imagem original enviada"
              src={beforeImage}
              alt="Arte original antes do processamento halftone"
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
          <p className="text-sm text-foreground">{subtitle}</p>
        </div>
        <span className="rounded-full border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">Exemplo real</span>
      </div>
      <div className="aspect-[4/5] overflow-hidden rounded-md border border-border/60 bg-card">
        <img src={src} alt={alt} className="h-full w-full object-cover object-center" loading="eager" />
      </div>
    </article>
  );
}
