import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DTFLEXPRO | Halftone profissional em segundos" },
      {
        name: "description",
        content:
          "Landing page da DTFLEXPRO para criar arte halftone profissional com rapidez, planos mensais e anuais e acesso à plataforma.",
      },
      { property: "og:title", content: "DTFLEXPRO | Halftone profissional em segundos" },
      {
        property: "og:description",
        content:
          "Transforme imagens em arte halftone com controle profissional, exportação em alta resolução e assinatura mensal ou anual.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.dtflexpro.com" }],
  }),
  component: LandingPage,
});
