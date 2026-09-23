# Project Memory

## Core
Todo PNG exportado pela ferramenta de halftone DEVE ter 300 DPI reais nos metadados (chunk pHYs = 11811 px/m). Patch fica em public/dtflex-tool/index.html — não remover.
Não alterar o bundle minificado public/dtflex-tool/assets/index-*.js nem o comportamento do halftone/reticulado — já funciona.
Manter exportação A4/A3/A2 em 300 DPI, transparente, com enquadramento manual pelos quatro cantos e botões −/+.

Em camisa colorida, aceitar somente PNG, preservar preto e remover fundo por conectividade; preto/branco mantêm seus presets próprios.

## Memories
- [Export 300 DPI](mem://features/export-300dpi) — Patch pHYs injetado no iframe da ferramenta DTFLEXPRO
- [Segmentação de fundo](mem://features/halftone-bg-segmentation) — Flood-fill de borda, proteção de olhos/cabelo/preto interno, painel de tamanho em cm @300 DPI
- [DTF inteligente tecidos coloridos](mem://features/dtf-inteligente-tecidos-coloridos) — Base branca adaptativa, preservar detalhes, preview na cor do tecido; preto/branco intocados
- [Motor universal de cor do tecido](mem://features/motor-universal-cor-tecido) — Qualquer HEX calcula base branca/choke/sombra/preto automaticamente; cor nunca apaga pixel
- [Protected Mask e halftone adaptativo](mem://features/protected-mask-coloridas) — Máscara protegida, proteção do preto, tolerância/suavização do fundo, pincéis manuais
- [Conta da Gestão DTF e fluxo da biblioteca](mem://features/management-account-library-flow) — Acesso automático, dados zerados por cliente e envio Biblioteca → Halftone



