# Plano de implementação — Pix Mercado Pago

## 1. Persistência e isolamento por estabelecimento

- Criar migration `020_pix_mercado_pago.sql`.
- Adicionar tabelas para configuração Pix, conexão OAuth por estabelecimento e cobrança Pix por pedido.
- Não alterar enums existentes: usar valores text com `check` para preservar compatibilidade com pedidos atuais.
- Criar índices únicos para `pedido_id` e identificador da order Mercado Pago, além de índices para consulta de pendências.
- Atualizar a função `fn_criar_pedido_publico` para aceitar `pix` e retornar o pedido sem enviá-lo à cozinha quando a configuração do restaurante exigir Pix automático.

## 2. Cliente Mercado Pago exclusivamente no servidor

- Criar `web/src/lib/mercado-pago.ts`.
- Centralizar OAuth com PKCE, troca/renovação de tokens e chamadas `POST /v1/orders`.
- Usar `MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET`, `MERCADO_PAGO_REDIRECT_URI` e uma chave de criptografia de tokens (`MERCADO_PAGO_TOKEN_ENCRYPTION_KEY`) somente no ambiente do servidor.
- Aplicar `X-Idempotency-Key` na criação de cobrança e validar todo retorno antes de persistir.
- Renovar token próximo da expiração e salvar o novo refresh token de modo atômico.

## 3. Rotas internas de configuração OAuth

- Criar rota autenticada para ler/salvar modo Pix do estabelecimento.
- Criar início OAuth (`/api/pagamentos/mercado-pago/conectar`) que gera `state` curto e PKCE, ligado à sessão e estabelecimento.
- Criar callback (`/api/pagamentos/mercado-pago/callback`) que valida state, troca code por token e redireciona de volta à configuração com resultado claro.
- Criar desconexão autenticada que apaga tokens e exige que o administrador escolha outro modo de Pix.
- Restringir configuração e desconexão ao papel de administrador.

## 4. Criação de pedido e cobrança pública

- Atualizar `web/src/app/api/publico/[slug]/pedidos/route.ts` para aceitar `pix` conforme a configuração pública do restaurante.
- Para Pix manual: criar pedido normalmente, com `pagamento_status = pendente`, e enviar para cozinha.
- Para Pix automático: criar pedido bloqueado, calcular o total exclusivamente no banco, criar a order Pix no Mercado Pago com expiração inicial de 30 minutos e responder QR base64, copia e cola, referência e data de expiração.
- Nunca aceitar valor, estado de pagamento ou dados de cobrança fornecidos pelo navegador.
- Incluir recuperação segura para criação parcial: se a cobrança falhar, o pedido bloqueado não deve ser enviado à cozinha e a resposta deve permitir tentar novamente.

## 5. Webhook e liberação única da cozinha

- Criar `/api/webhooks/mercado-pago` sem autenticação de sessão, com validação da assinatura conforme o produto Mercado Pago configurado.
- Consultar a order/pagamento no Mercado Pago antes de confiar no payload recebido.
- Em transação: conferir vínculo restaurante/order/valor/moeda; atualizar cobrança; marcar pedido pago; marcar `enviado_cozinha`; criar trabalho de impressão quando aplicável.
- Usar bloqueio/condição de atualização para que notificações repetidas não alterem nem imprimam o pedido mais de uma vez.
- Tratar estados pendente, aprovado, falho, expirado e estornado sem liberar a produção indevidamente.

## 6. Interfaces e experiência do usuário

- Criar o painel Pix em `ConfiguracoesModule`: seletor exclusivo Manual/Automático; conexão, estado e desconexão Mercado Pago.
- Expor apenas informações públicas seguras no endpoint `api/publico/[slug]`: modo Pix ativo e disponibilidade.
- Atualizar `CardapioPublico` para renderizar `Pix na entrega` no modo manual ou `Pix agora` no automático.
- Após selecionar Pix automático, exibir tela de aguardo com QR Code, Copia e Cola, contador de expiração e consulta de estado limitada; após confirmação, informar que o pedido foi liberado para preparo.
- Exibir o pagamento correto em Pedidos, Delivery, Cozinha e impressão.

## 7. Verificação

- Testar unitariamente geração de state/PKCE, criptografia, tradução de estados e idempotência.
- Testar integrações com credenciais de teste Mercado Pago: conectar, gerar Pix, receber evento, consultar order, pagar uma vez e receber evento duplicado.
- Testar Pix manual, QR expirado, token renovado, callback inválido, webhook inválido e falha da API.
- Rodar `npx tsc --noEmit`, `npm run lint` e `npm run build`.
- Antes de produção, configurar no Mercado Pago a URL OAuth e o webhook HTTPS do OhFome, informar as variáveis ao EasyPanel e testar em uma conta de restaurante de homologação.

## Ordem segura de entrega

1. Migration + biblioteca de servidor.
2. OAuth + configuração interna.
3. Fluxo público de cobrança.
4. Webhook e impressão.
5. UI de status e testes de ponta a ponta.
