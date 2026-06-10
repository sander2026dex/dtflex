## O que vou construir

### 1. Página pública `/pedido`
Cliente faz tudo numa tela:
- Upload da imagem (PNG/JPG, até 20MB)
- Nome, WhatsApp, e-mail
- Observações (opcional: efeito desejado, cor, tamanho)
- Botão "Pagar R$ 5,00 via Pix"
  - Abre checkout InfinitePay (link único por pedido)
- Após pagar, tela confirma e mostra botão "Enviar comprovante no WhatsApp" → `wa.me/5511943152441` com mensagem pré-preenchida contendo o nº do pedido

### 2. Botão flutuante WhatsApp em todo o site
- Componente já existe (`WhatsAppFloat.tsx`) — atualizo o número para `5511943152441` e mensagem padrão

### 3. Banco de dados
Nova tabela `halftone_orders`:
- `id` (uuid)
- `order_code` (texto curto tipo `HF-A3B9X2` para o cliente referenciar)
- `customer_name`, `customer_phone`, `customer_email`
- `image_path` (caminho no Storage)
- `notes` (texto)
- `amount` (numeric, default 5)
- `payment_status` ('pending' | 'paid' | 'failed')
- `delivery_status` ('aguardando_pagamento' | 'aguardando_envio' | 'enviado')
- `infinitepay_transaction_id`
- `paid_at`, `delivered_at`, `created_at`, `updated_at`
- RLS: insert público (qualquer um cria pedido), select/update só admin

Bucket Storage `halftone-uploads` (privado).

### 4. Webhook InfinitePay estendido
Reaproveito `/api/public/infinitepay-webhook` adicionando lógica: se o `transaction_id` ou um campo customizado (`external_reference`) bater com um `halftone_orders.id`, atualiza `payment_status='paid'` e `delivery_status='aguardando_envio'` (sem criar acesso de assinatura — só marca o pedido).

### 5. Painel admin — nova aba "Pedidos Halftone"
Em `/admin`, adiciono aba que lista pedidos:
- Filtros por status (todos / aguardando envio / enviados)
- Cada linha: código, cliente, WhatsApp (com botão abrir conversa), preview da imagem, botão download, botão "Marcar como enviado", botão copiar dados

### 6. Server functions (`src/lib/halftone-orders.functions.ts`)
- `createHalftoneOrder` (público) — recebe metadados, faz upload da imagem assinada, gera `order_code`, devolve `{ orderId, checkoutUrl }`
- `getHalftoneOrder` (público, por id) — para tela de confirmação
- `listHalftoneOrders` (admin) — lista pedidos
- `markHalftoneOrderDelivered` (admin)
- `getHalftoneImageUrl` (admin) — URL assinada para download

## Detalhes técnicos

- Upload via Storage com nome único; URL assinada de 24h para download admin
- Checkout InfinitePay: monto o link no padrão já usado no projeto (`pricingOptions`) parametrizado com `order_id` no `external_reference`/query string para o webhook conseguir casar
- Mensagem WhatsApp padrão após pagamento: *"Olá! Acabei de pagar o pedido HF-XXXX. Segue o comprovante."* + anexa a foto manualmente
- Validação Zod em todos os inputs (nome 2-80, telefone 10-13 dígitos, email válido, notas até 500)
- Sem autocriar conta de usuário — pedido é "anônimo", identificado só por `order_code` + e-mail

## O que NÃO vou fazer (fora do escopo)
- Integração automática com WhatsApp (envio do arquivo) — você manda manualmente como combinado
- Geração automática do halftone — você roda na ferramenta DTFlexPRO
- Não mexo no fluxo de assinatura existente (mensal/anual)

Posso seguir?