import { createFileRoute } from "@tanstack/react-router";
import { HalftoneStudio } from "@/components/HalftoneStudio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Halftone Studio · Offset 300 DPI · AM 35 LPI @ 22°" },
      {
        name: "description",
        content:
          "Automação de halftone offset de alta fidelidade: redimensionamento 300 DPI, retícula AM circular 35 LPI a 22°, transparência preservada, PNG 32-bit.",
      },
    ],
  }),
  component: HalftoneStudio,
});
