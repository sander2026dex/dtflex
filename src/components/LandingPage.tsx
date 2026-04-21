import { useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, MailCheck, Shield, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import beforeImage from "@/assets/shark-before.jpg";
import afterImage from "@/assets/landing-demo.jpg";
import { createCheckoutSession } from "@/lib/access.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const plans = [
  {
    code: "mensal" as const,
    name: "Plano Mensal",
    price: "R$ 47",
    cadence: "/mês",
    detail: "Acesso imediato para entrar na ferramenta, testar a demonstração e gerar o arquivo final com rapidez.",
    items: [
      "Checkout direto para pagamento do plano mensal",
      "Acesso privado à ferramenta apenas para clientes pagantes",
      "Processamento pensado para entregar o arquivo em aproximadamente 10 segundos",
    ],
  },
  {
    code: "anual" as const,
    name: "Plano Anual",
    price: "R$ 168,90",
    cadence: "/ano",
    detail: "Mais economia para operar o ano todo com acesso contínuo, melhor margem e ritmo de produção constante.",
    items: [
      "Melhor custo-benefício comparado ao plano mensal",
      "Perfeito para quem usa a ferramenta com frequência e maior volume",
      "Mesma liberação rápida com retorno do checkout e acesso exclusivo ao cliente",
    ],
    featured: true,
  },
];

const socialProof = [
  "Mostre o antes e depois da arte com mais impacto e aumente a confiança do cliente na compra.",
  "Automatize checkout, envio de acesso e entrada na plataforma sem precisar liberar manualmente.",
  "Tenha uma operação mais profissional com painel, segurança, pagamentos e acessos centralizados.",
];

const productHighlights = [
  "Demonstração visual com comparação entre imagem original e resultado final",
  "Fluxo rápido para transformar a arte e preparar o arquivo em segundos",
  "Login do cliente por código de acesso após a compra confirmada",
  "Ferramenta protegida para uso exclusivo de quem comprou",
];

const quickSteps = [
  "Suba a arte original",
  "A ferramenta processa e monta o resultado",
  "Baixe o arquivo pronto em cerca de 10 segundos",
];

export function LandingPage() {
  const createCheckout = useServerFn(createCheckoutSession);
  const [email, setEmail] = useState("");
  const [loadingPlan, setLoadingPlan] = useState<"mensal" | "anual" | null>(null);

  async function handleSubscribe(planCode: "mensal" | "anual") {
    if (!email.trim()) {
      toast.error("Informe seu e-mail para continuar.");
      return;
    }

    try {
      setLoadingPlan(planCode);
      const result = await createCheckout({
        data: {
          email,
          planCode,
        },
      });

      if (result.url) {
        window.location.href = result.url;
      }
    } catch {
      toast.error("Não foi possível iniciar o pagamento.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-18">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 text-xs uppercase tracking-[0.28em] text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              DTFLEXPRO
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
                Venda melhor o seu produto com uma demonstração forte de antes e depois.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                A DTFLEXPRO mostra a transformação da arte, leva o cliente direto para o checkout do plano mensal ou anual, devolve ele para o login de acesso e libera a ferramenta só para quem comprou.
              </p>
            </div>
            <div className="grid max-w-xl gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Seu melhor e-mail"
                aria-label="Seu melhor e-mail"
              />
              <Button size="lg" onClick={() => handleSubscribe("mensal")} disabled={loadingPlan !== null}>
                {loadingPlan ? "Abrindo checkout..." : "Comprar agora"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              {quickSteps.map((step, index) => (
                <div key={step} className="rounded-lg border border-border bg-card/40 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-primary">0{index + 1}</div>
                  <p className="leading-6">{step}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <Link
                to="/login"
                search={{ code: "", email: "" }}
                className="inline-flex items-center gap-2 text-foreground hover:text-primary"
              >
                <MailCheck className="h-4 w-4" />
                Login de acesso do cliente
              </Link>
              <span className="inline-flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Pagou, volta do checkout e entra na área privada
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/60 p-4 shadow-[var(--shadow-panel)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <span>Demonstração visual</span>
              <span>Antes e depois</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <DemoImage title="Antes" src={beforeImage} alt="Imagem original enviada pelo usuário para demonstração do antes" />
              <DemoImage title="Depois" src={afterImage} alt="Resultado final processado pela ferramenta DTFLEXPRO" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid gap-4 md:grid-cols-3">
            <BenefitCard
              icon={LockKeyhole}
              title="Ferramenta exclusiva"
              description="A área da ferramenta fica protegida e só é liberada para quem conclui a compra e valida o código recebido."
            />
            <BenefitCard
              icon={MailCheck}
              title="Compra e acesso rápidos"
              description="O cliente clica em comprar, vai direto para o checkout do plano escolhido e recebe o acesso para entrar na plataforma."
            />
            <BenefitCard
              icon={Shield}
              title="Controle total"
              description="Administração com acompanhamento de pagamentos, códigos ativos, revogação de acesso e monitoramento de segurança."
            />
          </div>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="mb-6 max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-tight">O que a ferramenta oferece</h2>
            <p className="mt-2 text-muted-foreground">
              Tudo o que o cliente precisa para visualizar a transformação, ganhar velocidade e receber acesso somente após o pagamento confirmado.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {productHighlights.map((item) => (
              <Card key={item} className="rounded-lg bg-card/50 p-5">
                <div className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="mb-6 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">Prova social</h2>
            <p className="mt-2 text-muted-foreground">
              Posicionamento comercial para gerar confiança, acelerar a compra e apresentar a DTFLEXPRO como uma solução profissional.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {socialProof.map((item) => (
              <Card key={item} className="rounded-lg bg-card/50 p-5">
                <div className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="mb-6 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">Planos</h2>
            <p className="mt-2 text-muted-foreground">
              Escolha o plano mensal ou anual, siga direto para o checkout e receba o acesso no mesmo e-mail usado na compra.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <Card
                key={plan.code}
                className={`rounded-lg p-6 ${plan.featured ? "border-primary shadow-[var(--shadow-glow)]" : "bg-card/50"}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-medium">{plan.name}</h3>
                  {plan.featured ? (
                    <span className="rounded-md bg-secondary px-3 py-1 text-xs text-secondary-foreground">Mais vantajoso</span>
                  ) : null}
                </div>
                <div className="mb-2">
                  <span className="text-4xl font-semibold">{plan.price}</span>
                  <span className="ml-2 text-muted-foreground">{plan.cadence}</span>
                </div>
                <p className="mb-6 text-sm text-muted-foreground">{plan.detail}</p>
                <div className="mb-6 space-y-3">
                  {plan.items.map((item) => (
                    <div key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={() => handleSubscribe(plan.code)} disabled={loadingPlan !== null}>
                  {loadingPlan === plan.code ? "Abrindo checkout..." : `Comprar ${plan.name}`}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function BenefitCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Shield;
  title: string;
  description: string;
}) {
  return (
    <Card className="rounded-lg bg-card/50 p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </Card>
  );
}

function DemoImage({ title, src, alt }: { title: string; src: string; alt: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</div>
      <div className="aspect-[4/5] overflow-hidden rounded-md border border-border bg-card">
        <img src={src} alt={alt} className="h-full w-full object-cover object-center" loading="lazy" />
      </div>
    </div>
  );
}
