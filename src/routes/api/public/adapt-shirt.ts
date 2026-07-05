import { createFileRoute } from "@tanstack/react-router";

// Endpoint público consumido pelo iframe da ferramenta DTFLEXPRO.
// Recebe { prompt } e devolve { paper, margin, aspect, notes, shirtColor }
// interpretado por IA a partir do pedido em linguagem natural do usuário
// (ex.: "camisa preta gola redonda tamanho médio").
export const Route = createFileRoute("/api/public/adapt-shirt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { prompt?: string };
          const prompt = (body?.prompt || "").toString().slice(0, 800).trim();
          if (!prompt) {
            return new Response(JSON.stringify({ error: "prompt vazio" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }

          const system = `Você é um assistente da ferramenta DTFLEXPRO (impressão DTF).
Interprete o pedido do usuário sobre a camisa e o tamanho desejado, e devolva APENAS um JSON com o formato:
{
 "paper": "A4" | "A3",
 "margin_mm": number (0-40, margem de segurança ao redor da arte),
 "aspect": "livre" | "1:1" | "3:4" | "4:3" | "A4" | "A3",
 "shirt_color": "preta"|"branca"|"cinza"|"colorida"|"clara"|"escura"|"desconhecida",
 "notes": string (curto, em português, dicas para o usuário)
}
Regras:
- Camisas escuras (preta/marinho/cinza escuro) → recomende margem 10-15mm e note que a base branca do DTF é essencial.
- Camisas claras (branca/bege/rosa claro) → margem 8-12mm; sem necessidade de base branca extra.
- Se o usuário citar tamanhos ("pequeno/médio/grande/A4/A3/bolso/costas"): pequeno=A4 com margem 15mm; médio=A4 margem 10mm; grande/costas=A3 margem 10mm; bolso=A4 margem 20mm com aspect 1:1.
- Se não citar tamanho, default paper=A4, margin_mm=10, aspect="livre".
Responda SOMENTE o JSON, sem markdown, sem comentários.`;

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Lovable-API-Key": key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: system },
                { role: "user", content: prompt },
              ],
              response_format: { type: "json_object" },
            }),
          });

          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            return new Response(
              JSON.stringify({
                error: `Gateway ${res.status}`,
                detail: txt.slice(0, 300),
              }),
              { status: 502, headers: { "content-type": "application/json" } },
            );
          }
          const json: any = await res.json();
          const raw = json?.choices?.[0]?.message?.content || "{}";
          let parsed: any = {};
          try {
            parsed = JSON.parse(raw);
          } catch {
            const m = /\{[\s\S]*\}/.exec(raw);
            if (m) {
              try {
                parsed = JSON.parse(m[0]);
              } catch {
                parsed = {};
              }
            }
          }

          // Sanitizar
          const paper = parsed.paper === "A3" ? "A3" : "A4";
          let margin = Number(parsed.margin_mm);
          if (!Number.isFinite(margin)) margin = 10;
          margin = Math.max(0, Math.min(40, margin));
          const allowedAspect = new Set(["livre", "1:1", "3:4", "4:3", "A4", "A3"]);
          const aspect = allowedAspect.has(parsed.aspect) ? parsed.aspect : "livre";
          const shirtColor = String(parsed.shirt_color || "desconhecida").slice(0, 30);
          const notes = String(parsed.notes || "").slice(0, 500);

          return new Response(
            JSON.stringify({ paper, margin_mm: margin, aspect, shirt_color: shirtColor, notes }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || "erro" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
