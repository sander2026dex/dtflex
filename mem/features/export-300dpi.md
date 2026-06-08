---
name: Export PNG 300 DPI real (A4 + A3)
description: Patch no iframe DTFLEXPRO que reescreve canvas.toBlob / toDataURL para inserir chunk pHYs (11811 px/m = 300 DPI) em todo PNG exportado, e injeta botões "Salvar PNG A4" e "Salvar PNG A3"
type: feature
---

Local: `public/dtflex-tool/index.html` (bloco script no <head>).

Comportamento:
- Intercepta `HTMLCanvasElement.prototype.toBlob` e `toDataURL` para `image/png`.
- Reescreve o buffer PNG inserindo um chunk `pHYs` (x/y = 11811 px/m, unit = 1) com CRC-32 recalculado, antes do primeiro chunk não-IHDR.
- Antes do download final, valida e, se preciso, regrava o pHYs.
- Injeta dois botões ao lado do "Exportar Master":
  - "Salvar PNG A4 (300 DPI)": canvas 2480 x 3508, centralizado, transparente.
  - "Salvar PNG A3 (300 DPI)": canvas 3508 x 4961, centralizado, transparente.
- Ambos passam pelo mesmo pipeline pHYs (300 DPI cravado).
- Bundle minificado da ferramenta (`assets/index-*.js`) NÃO é modificado.

Regra: nunca remover esse patch. Validar abrindo o PNG exportado em Photoshop/identify — deve mostrar 300 DPI, não 72/96/150. A4 já está validado; A3 segue o mesmo caminho via `makeSizedCanvas`.

