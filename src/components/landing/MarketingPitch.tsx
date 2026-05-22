import { Card } from "@/components/ui/card";

const speedBenefits = [
  "⚡ Gere efeitos halftone profissionais em segundos",
  "🎨 Separação inteligente para artes coloridas e fundo preto",
  "🖤 Qualidade extrema em camisetas escuras",
  "🌈 Cores mais vivas e pontos mais definidos",
  "🚀 Processamento ultra rápido",
  "🖥️ Interface simples e automática",
  "🔥 Resultado profissional sem complicação",
  "👕 Ideal para estamparias, designers e produção DTF",
];

const reticulas = [
  { glyph: "●", label: "Círculo" },
  { glyph: "◆", label: "Losango" },
  { glyph: "▬", label: "Linha" },
  { glyph: "❖", label: "Diamante" },
  { glyph: "⬭", label: "Elipse" },
  { glyph: "✿", label: "Roseta" },
];

const checks = [
  "Halftone para camisas pretas",
  "Halftone para camisas coloridas",
  "Alta definição",
  "Mais produtividade",
  "Grupo exclusivo de suporte",
];

export function MarketingPitch() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10 max-w-3xl space-y-3">
          <p className="text-sm uppercase tracking-[0.24em] text-brand">DTFlexPRO</p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            🔥 Transforme suas estampas com a potência da DTFlexPRO
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            A ferramenta definitiva de halftone automático para DTF, criada para quem busca velocidade,
            qualidade profissional e resultados impressionantes em camisetas pretas e coloridas.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {speedBenefits.map((item) => (
            <Card
              key={item}
              className="rounded-lg border-border/70 bg-card/55 p-4 text-sm leading-7 text-muted-foreground backdrop-blur"
            >
              {item}
            </Card>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card className="rounded-lg border-border/70 bg-card/60 p-6 backdrop-blur">
            <p className="text-sm uppercase tracking-[0.2em] text-brand">Reticulas disponíveis</p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Escolha o ponto perfeito para o seu projeto.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {reticulas.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center gap-3 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-sm"
                >
                  <span className="text-xl text-brand">{r.glyph}</span>
                  <span className="text-muted-foreground">{r.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="rounded-lg border-border/70 bg-card/60 p-6 backdrop-blur">
            <p className="text-sm uppercase tracking-[0.2em] text-brand">Tudo que você ganha</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
              {checks.map((c) => (
                <li key={c} className="flex items-start gap-2">
                  <span className="text-brand">✅</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm font-semibold text-foreground">
              DTFlexPRO — O halftone mais rápido do mercado.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}
