import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DTFLEXPRO | Plataforma com acesso liberado por código" },
      {
        name: "description",
        content:
          "Landing pública da DTFLEXPRO com checkout, painel admin, validação por código e acesso seguro à plataforma.",
      },
      { property: "og:title", content: "DTFLEXPRO | Plataforma com acesso liberado por código" },
      {
        property: "og:description",
        content:
          "Venda acesso à sua plataforma com pagamento, envio automático de código por e-mail e painel protegido para administração.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.dtflexpro.com" }],
  }),
  component: LandingPage,
});
