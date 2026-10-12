import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, MessageCircle } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pricingOptions } from "@/components/landing/data";

const WHATSAPP_NUMBER = "5511943152441";

const searchSchema = z.object({
  plano: z.enum(["mensal", "anual"]).catch("anual"),
});

export const Route = createFileRoute("/pagamento")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Pagamento do plano — DTFLEXPRO" },
      {
        name: "description",
        content:
          "Finalize o pagamento do plano mensal ou anual da DTFLEXPRO via Nubank (Pix ou cartão) e libere seu acesso.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Pagamento do plano — DTFLEXPRO" },
      {
        property: "og:description",
        content: "Finalize o pagamento do plano mensal ou anual da DTFLEXPRO via Nubank (Pix ou cartão).",
      },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Pagamento do plano — DTFLEXPRO" },
      {
        name: "twitter:description",
        content: "Finalize o pagamento do plano mensal ou anual da DTFLEXPRO via Nubank (Pix ou cartão).",
      },
    ],
  }),
  component: PagamentoPage,
});

function PagamentoPage() {
  const navigate = useNavigate();
  const { plano } = Route.useSearch();
  const plan = pricingOptions.find((option) => option.billing === plano) ?? pricingOptions[0];

  function handleCheckout() {
    // Mesma janela — nunca abre uma segunda janela/aba.
    window.location.href = plan.checkoutHref;
  }

  function handleSendReceipt() {
    const message = encodeURIComponent(
      `Olá! Acabei de pagar o ${plan.label} (${plan.price}) da DTFLEXPRO. Segue o comprovante.`,
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen bg-background py-10">
      <div className="mx-auto max-w-2xl px-6">
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para a página inicial
        </button>

        <Card className="rounded-lg border-border/70 bg-card/60 p-8 shadow-[var(--shadow-panel)] backdrop-blur-xl">
          <div className="space-y-3 border-b border-border/70 pb-6">
            <p className="text-sm uppercase tracking-[0.24em] text-brand">Pagamento</p>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{plan.label}</h1>
              <div className="text-right">
                <div className="text-3xl font-semibold tracking-tight text-[oklch(0.86_0.18_92)]">{plan.price}</div>
                <div className="text-sm text-[oklch(0.86_0.18_92)]/80">{plan.cadence}</div>
              </div>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">{plan.summary}</p>
          </div>

          <div className="grid gap-3 py-6">
            {plan.benefits.map((benefit) => (
              <div key={benefit} className="flex items-start gap-3 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="leading-7">{benefit}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-border/70 pt-6">
            <Button
              size="lg"
              className="w-full bg-[oklch(0.86_0.18_92)] text-black hover:bg-[oklch(0.80_0.18_92)] shadow-[0_0_24px_oklch(0.86_0.18_92/0.45)]"
              onClick={handleCheckout}
            >
              Pagar com Nubank ({plan.price})
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full bg-[oklch(0.62_0.19_150)] text-white hover:bg-[oklch(0.56_0.19_150)] border-transparent shadow-[0_0_24px_oklch(0.62_0.19_150/0.45)]"
              onClick={handleSendReceipt}
            >
              <MessageCircle className="h-4 w-4" />
              Enviar comprovante no WhatsApp
            </Button>
            <p className="text-sm text-muted-foreground">
              Pagamento via Nubank (Pix ou cartão), na mesma janela. Após pagar, use o botão de voltar do navegador para
              retornar aqui e envie o comprovante pelo WhatsApp para liberarmos seu acesso.
            </p>
            <div className="pt-2">
              <Link
                to="/"
                className="text-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                Voltar para a landpage
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
