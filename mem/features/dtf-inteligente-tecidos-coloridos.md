---
name: HALFTONE DTF INTELIGENTE — tecidos coloridos
description: Camada separada em public/dtflex-tool/index.html para camisas coloridas — base branca adaptativa, preservação de preto e preview na cor do tecido
type: feature
---

Fluxo de camisa PRETA e BRANCA permanece intocado. Tecido colorido usa camada extra.

Regras:
- A cor da camiseta NUNCA apaga pixel. Nada de color key. Preto da arte (cabelo, barba, olhos, sombras, contornos) sempre preservado.
- Remoção de fundo continua só por conectividade com as bordas; o seletor "Preservar detalhes" (baixo/médio/alto/máximo → `window.__DTF_PRESERVE`) multiplica LOCAL_TOL/GLOBAL_TOL/EDGE_STOP (1.25 / 1 / 0.75 / 0.55).
- Base branca adaptativa (`window.__DTF_SMART_APPLY`): alpha da arte, contraído pelo choke (0–4 px), modulado pelo contraste entre a cor do pixel e a cor do tecido — menos contraste = mais branco. Só soma branco por baixo, nunca subtrai.
- Painel flutuante aparece somente quando `window.__DTF_SHIRT_COLOR === 'colorida'`: cobertura branca, choke, preservar detalhes, "Ver na camisa", exportar PNG da base branca e PNG das cores.
- Preview simula a arte sobre a cor real do tecido, com alternância Halftone final / Arte original / Só base branca.
