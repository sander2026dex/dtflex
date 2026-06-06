---
name: Export PNG 300 DPI real
description: Patch no iframe DTFLEXPRO que reescreve canvas.toBlob / toDataURL para inserir chunk pHYs (11811 px/m = 300 DPI) em todo PNG exportado
type: feature
---

Local: `public/dtflex-tool/index.html` (bloco script no <head>).

Comportamento:
- Intercepta `HTMLCanvasElement.prototype.toBlob` e `toDataURL` para `image/png`.
- Reescreve o buffer PNG inserindo um chunk `pHYs` antes do primeiro chunk não-IHDR, com:
  - x/y pixels per meter = round(300 * 39.3701) = 11811
  - unit = 1 (metro)
- CRC-32 recalculado.
- Bundle minificado da ferramenta (`assets/index-*.js`) NÃO é modificado.

Regra: nunca remover esse patch. Validar abrindo o PNG exportado em Photoshop/identify — deve mostrar 300 DPI.
