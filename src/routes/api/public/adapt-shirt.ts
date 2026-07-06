import { createFileRoute } from "@tanstack/react-router";

// Recebe a arte gerada pela ferramenta + cor/descrição da camisa e
// devolve a MESMA arte adaptada para ficar compatível com aquela cor
// (contraste, halos, base branca implícita, iluminação), usando o
// modelo de edição de imagem do Lovable AI Gateway.

function hexToName(hex?: string | null): string {
  if (!hex) return "";
  const h = hex.replace("#", "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(h)) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const tone = lum < 0.35 ? "escura" : lum > 0.75 ? "muito clara" : "média";
  return `#${h} (tom ${tone}, RGB ${r},${g},${b})`;
}

export const Route = createFileRoute("/api/public/adapt-shirt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            prompt?: string;
            hexColor?: string;
            imageDataUrl?: string;
          };
          const prompt = (body?.prompt || "").toString().slice(0, 800).trim();
          const hex = (body?.hexColor || "").toString().trim();
          const imageDataUrl = (body?.imageDataUrl || "").toString();

          if (!imageDataUrl.startsWith("data:image/")) {
            return json({ error: "imageDataUrl ausente/ inválido" }, 400);
          }
          if (!prompt && !hex) {
            return json({ error: "informe a cor (hex) ou uma descrição" }, 400);
          }

          const key = process.env.LOVABLE_API_KEY;
          if (!key) return json({ error: "LOVABLE_API_KEY ausente" }, 500);

          const colorInfo = hexToName(hex);
          const instruction = `Você é um assistente de arte para impressão DTF.
A imagem enviada é a arte final que será estampada em uma camisa da cor: ${colorInfo || "não informada"}.
Descrição/pedido do cliente: ${prompt || "(sem observações extras)"}.

Adapte a MESMA arte para ficar visualmente compatível com essa cor de camisa:
- Se a camisa for ESCURA: aumente contraste, reforce bordas, remova halos escuros indesejados e simule uma base branca sólida por baixo dos elementos coloridos (o fundo da imagem DEVE permanecer TRANSPARENTE).
- Se a camisa for CLARA: suavize halos brancos, mantenha bordas limpas, ajuste levemente a saturação. Fundo TRANSPARENTE.
- Nunca acrescente uma camisa, mockup, textura de tecido ou fundo colorido — devolva SOMENTE a arte isolada em PNG com fundo transparente, mesmas proporções e mesmo enquadramento.
- Preserve o assunto e a composição original. Apenas ajuste cores, contraste e bordas para ficar ideal naquela cor de camisa.
Devolva a imagem editada.`;

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Lovable-API-Key": key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3.1-flash-image",
              modalities: ["image", "text"],
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: instruction },
                    { type: "image_url", image_url: { url: imageDataUrl } },
                  ],
                },
              ],
            }),
          });

          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            return json(
              { error: `Gateway ${res.status}`, detail: txt.slice(0, 400) },
              res.status === 429 || res.status === 402 ? res.status : 502,
            );
          }
          const data: any = await res.json();
          const msg = data?.choices?.[0]?.message;
          // Procura a imagem na resposta (formato OpenAI-compatible)
          let outUrl: string | null = null;
          const images = msg?.images;
          if (Array.isArray(images) && images.length > 0) {
            outUrl = images[0]?.image_url?.url || images[0]?.url || null;
          }
          if (!outUrl && Array.isArray(msg?.content)) {
            for (const p of msg.content) {
              if (p?.type === "image_url" && p?.image_url?.url) {
                outUrl = p.image_url.url;
                break;
              }
            }
          }
          if (!outUrl) {
            return json(
              { error: "IA não retornou imagem", detail: JSON.stringify(msg || {}).slice(0, 400) },
              502,
            );
          }
          const notes = typeof msg?.content === "string" ? msg.content.slice(0, 400) : "";
          return json({ imageDataUrl: outUrl, notes, shirtColor: colorInfo });
        } catch (e: any) {
          return json({ error: e?.message || "erro" }, 500);
        }
      },
    },
  },
});

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
