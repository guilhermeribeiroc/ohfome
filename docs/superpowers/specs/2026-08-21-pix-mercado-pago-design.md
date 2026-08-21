# Pix Mercado Pago por restaurante

## Objetivo

Permitir que cada restaurante escolha uma única modalidade de Pix no cardápio público:

- **Pix manual — pagar na entrega:** o cliente informa que pagará via Pix ao receber o pedido; não há QR Code nem integração financeira.
- **Pix automático — QR Code Mercado Pago:** o pedido recebe uma cobrança Pix única, com QR Code e código Copia e Cola; ele só é liberado para cozinha após a confirmação segura do pagamento.

O primeiro provedor será Mercado Pago. A integração deve funcionar como uma plataforma: cada restaurante conecta e recebe em sua própria conta Mercado Pago.

## Decisões de produto

1. Os modos Pix são mutuamente exclusivos. O restaurante usa Pix manual ou Pix automático, nunca ambos no cardápio ao mesmo tempo.
2. Pix automático exige autorização OAuth da conta Mercado Pago do restaurante; o administrador não cola nem manipula tokens.
3. Pix manual cria o pedido imediatamente, mantém `pagamento_status = pendente` e envia o pedido para cozinha/impressão.
4. Pix automático cria uma cobrança por pedido e mantém o pedido fora da cozinha enquanto o pagamento estiver pendente.
5. Apenas uma confirmação verificada pelo servidor pode mudar um Pix automático para pago e liberar cozinha/impressão.

## Configuração

Criar a área **Configurações → Pagamentos → Pix**.

### Pix manual

- Seleção: `Pix manual — pagar na entrega`.
- Não requer Mercado Pago.
- Exibe no cardápio a opção `Pix na entrega`.
- Opcionalmente, permite cadastrar a chave Pix e uma instrução para constar na operação do restaurante; ela não é usada para confirmação automática.

### Pix automático

- Seleção: `Pix automático — Mercado Pago`.
- Botão `Conectar Mercado Pago` inicia OAuth.
- Após retorno válido, a tela mostra conta conectada, data da conexão e botão `Desconectar`.
- Tokens de acesso e renovação são armazenados criptografados no servidor, associados apenas ao estabelecimento. Nunca são retornados ao cliente web e nunca entram em logs.
- Desconectar muda o modo para manual ou desativa Pix, mediante confirmação explícita do administrador.

## Fluxo do cardápio

### Pix manual

```text
Cliente escolhe Pix na entrega
→ confirma pedido
→ pedido criado com pagamento pendente
→ cozinha e estação de impressão recebem a comanda
→ equipe registra o recebimento posteriormente
```

### Pix automático

```text
Cliente confirma o pedido
→ servidor cria pedido aguardando pagamento e cobrança Pix Mercado Pago
→ cardápio mostra QR Code, valor e Pix Copia e Cola
→ Mercado Pago envia webhook de atualização
→ servidor consulta e valida a cobrança
→ servidor marca pagamento como pago
→ pedido é liberado uma única vez para cozinha e impressão
```

O QR Code será de uso único e terá vencimento configurável, inicialmente 30 minutos. Vencido ou recusado, o pedido permanece fora da cozinha; a tela permite recomeçar a cobrança sem duplicar o pedido nem imprimir comandas.

## Estado e dados

Manter configuração e transações separadas dos dados visíveis de pedido:

- `integracoes_pagamento`: estabelecimento, provedor, status da conexão, identificador externo da conta, tokens criptografados, datas de criação/atualização.
- `configuracoes_pix`: estabelecimento, modo (`manual` ou `mercado_pago`), chave/instrução manual opcional, prazo de vencimento.
- `pagamentos`: pedido, provedor, identificador externo da cobrança, valor, status, expiração, payload mínimo de auditoria e datas de confirmação.

O pedido usará os estados de pagamento existentes (`pendente`, `pago`, `falhou`, `estornado`) e poderá ter o estado operacional `aguardando_pagamento` antes de ser enviado à cozinha.

## Segurança e consistência

- O frontend não decide que um pagamento foi concluído.
- O endpoint de webhook recebe notificações do Mercado Pago e busca o pagamento pela API do provedor antes de alterar um pedido.
- A validação confere: conta Mercado Pago vinculada ao restaurante, identificador da cobrança, moeda, valor e situação aprovada.
- Processamento idempotente por identificador do pagamento: notificações repetidas não repetem alteração, envio à cozinha ou impressão.
- As rotas internas exigem sessão e isolamento por estabelecimento.
- Credenciais de teste e produção são segregadas por ambiente.

## Interfaces e falhas previstas

- Acompanhamento público do Pix automático: `Aguardando pagamento`, `Pago`, `Expirado` e `Não foi possível confirmar`.
- O QR Code e Copia e Cola aparecem somente depois da criação de cobrança bem-sucedida.
- Falhas de conexão com Mercado Pago não criam pedido liberado à cozinha; a tela informa que o pagamento não pôde ser preparado e permite nova tentativa.
- Painel interno lista pagamentos pendentes. Em Pix manual, usuários autorizados podem registrar o recebimento; em Pix automático, essa ação não substitui a confirmação do provedor.

## Dependências externas

O OhFome precisa de uma única aplicação Mercado Pago configurada para plataforma/OAuth, com URLs HTTPS de retorno e webhook no domínio oficial. Cada restaurante autoriza sua própria conta dentro dessa aplicação.

Desenvolvimento começa com credenciais de teste e webhook de teste; produção somente após validar criação da cobrança, retorno de webhook, prevenção de duplicidade e liberação única da impressão.

## Fora de escopo desta etapa

- Cartão e outras formas de pagamento on-line.
- Conciliação financeira completa, estorno e reembolso automatizados.
- Pix agendado.
- Vários provedores Pix simultâneos.
- Horários de funcionamento e pausa manual do cardápio, que serão tratados como módulo separado após esta integração.
