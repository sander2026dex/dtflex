# Project Memory

## Core
Todo PNG exportado pela ferramenta de halftone DEVE ter 300 DPI reais nos metadados (chunk pHYs = 11811 px/m). Patch fica em public/dtflex-tool/index.html — não remover.
Não alterar o bundle minificado public/dtflex-tool/assets/index-*.js nem o comportamento do halftone/reticulado — já funciona.
Manter opção “Salvar PNG A4 (300 DPI)” na ferramenta: 2480 x 3508 px, transparente, metadados pHYs cravados em 300 DPI.

Remoção de fundo é SEMPRE por conectividade com as bordas — nunca por cor. Cor da camisa afeta só retícula/preview.

## Memories
- [Export 300 DPI](mem://features/export-300dpi) — Patch pHYs injetado no iframe da ferramenta DTFLEXPRO
- [Segmentação de fundo](mem://features/halftone-bg-segmentation) — Flood-fill de borda, proteção de olhos/cabelo/preto interno, painel de tamanho em cm @300 DPI

