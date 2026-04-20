import { createFileRoute } from "@tanstack/react-router";
import { HalftoneStudio } from "@/components/HalftoneStudio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DTFLEX Pro | Halftone CMYK Profissional" },
      {
        name: "description",
        content:
          "Landing + estúdio profissional com Circular e Rosette CMYK real, fundo vazado, preto transparente e exportação PNG 300 DPI.",
      },
      { property: "og:title", content: "DTFLEX Pro | Halftone CMYK Profissional" },
      {
        property: "og:description",
        content:
          "Circular e Rosette CMYK com retícula real, preto vazado e saída pronta para comercializar sua plataforma.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.dtflexpro.com" }],
  }),
  component: HalftoneStudio,
});
