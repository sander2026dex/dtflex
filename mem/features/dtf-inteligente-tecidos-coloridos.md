---
name: HALFTONE DTF INTELIGENTE — tecidos coloridos
description: Halftone universal para PNG em camisas brancas e coloridas — nenhuma remoção, todas as cores e o Alpha original são preservados
type: feature
---

Fluxo de camisa PRETA permanece intocado. Tecidos BRANCOS e COLORIDOS usam o Halftone Universal.

Regras:
- Camisas branca e colorida aceitam SOMENTE PNG. JPG, PDF, PSD e outros formatos recebem advertência e esses modos não são aplicados.
- Nenhuma remoção de fundo, segmentação, knockout, máscara manual ou descarte por cor é executado nesses modos.
- `preserveOriginalAlpha()` recompõe o resultado usando o Alpha original, pixel a pixel. A retícula pode alterar o RGB, mas não pode criar ou remover transparência.
- Se o motor de retícula abrir um pixel que era visível, o RGB original é recuperado e seu Alpha original é restaurado.
- Preto, branco, cinza, cores, texto, rosto, olhos, boca, cabelo, roupas, sombras e detalhes permanecem presentes.
- Preview e arquivo final usam o mesmo `window.__DTF_SMART_APPLY`; a cor da camiseta aparece somente no fundo da simulação.
- Camisa preta permanece no fluxo próprio anterior, sem alteração.
