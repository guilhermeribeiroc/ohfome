# Design: Pix automático no novo pedido presencial

**Data:** 2026-10-14  
**Status:** design aprovado em conversa; aguardando revisão escrita antes da implementação

## Objetivo

Permitir que o atendente gere uma cobrança Pix por QR Code no modal **Novo pedido** da Central de Pedidos para balcão, retirada e delivery. A cobrança deve obedecer ao mesmo ciclo confiável já usado pelo cardápio público: pedido reservado, confirmação segura pelo Mercado Pago e liberação automática para cozinha somente após o pagamento.

O cardápio digital não pedirá e-mail quando o cliente escolher Pix automático. O servidor gerará um identificador técnico de pagador exclusivamente para a API do Mercado Pago, sem transformar esse valor em contato do cliente.

## Decisões confirmadas

- Pix automático pode ser usado para pedido de balcão, retirada e delivery criado na Central.
- As opções de Pix dependem do atendimento: em **balcão** e **retirada**, o atendente escolhe **Pix manual** ou **Pix automático**; em **delivery**, escolhe **Pix na entrega** ou **Pix automático**.
- O atendente escolhe Pix e gera o QR Code explicitamente; não há cobrança antes dessa ação.
- Com QR automático, o pedido só segue à cozinha após confirmação do Mercado Pago.
- Para dinheiro, cartão, Pix manual e Pix na entrega, o fluxo atual segue sem QR e o pedido vai normalmente para a cozinha conforme sua modalidade.
- A validade de cinco minutos fica fora desta entrega: a integração online atual do Mercado Pago exige mínimo de 30 minutos. A validade real continua 30 minutos até avaliação de uma modalidade compatível.
- O campo de e-mail deixa de ser exibido/exigido no cardápio público para Pix automático.

## Arquitetura escolhida

### Pedido presencial e QR

1. No novo pedido, o atendente escolhe o tipo de atendimento e adiciona itens normalmente. A forma de Pix exibida é contextual: **Pix manual** em balcão/retirada e **Pix na entrega** no delivery; ambas são alternativas sem cobrança automática. **Pix automático** aparece em todos os três tipos.
2. Ao selecionar **Pix automático**, o botão principal muda para **Gerar QR Pix**. O backend cria o pedido com `pagamento_status = pendente` e `enviado_cozinha = false`, reserva o estoque e cria a cobrança no Mercado Pago com chave de idempotência única.
3. A resposta traz apenas os dados necessários para o modal seguro: código do pedido, QR em base64, Pix copia-e-cola e data/hora de expiração.
4. A Central mostra modal de cobrança com QR, copiar-e-colar, contagem regressiva e acompanhamento do status. O QR não é impresso automaticamente nem exposto fora da sessão que o gerou.
5. O webhook do Mercado Pago é o caminho primário. O modal pode consultar o estado local e usar sincronização remota limitada como contingência, reutilizando a regra já existente no pedido público.
6. Em pagamento aprovado, uma função transacional atualiza cobrança/pedido, baixa estoque, marca `enviado_cozinha = true` e dispara a fila de impressão. Uma confirmação duplicada não repete esses efeitos.
7. Em expiração ou falha, a reserva de estoque é liberada e o pedido fica com pagamento falho. A UI informa claramente o resultado e oferece gerar nova cobrança com nova chave de idempotência, sem reutilizar QR vencido.

### Dados e API

- Criar uma operação autenticada específica para gerar Pix de um pedido presencial pendente, ou estender com contrato explícito o `POST /api/pedidos`; a implementação escolherá a separação que preserve idempotência por ação e impeça cobrança duplicada.
- A criação do pedido e o registro local de `pagamentos_pix` ocorrem no mesmo escopo transacional. A chamada externa acontece com recuperação segura: se o provedor não responder de modo inequívoco, o sistema não gera outro QR automaticamente.
- O endpoint valida tenant, permissão da Central/Delivery, modalidade permitida, itens, total calculado no banco, configuração Pix automática ativa e conta Mercado Pago conectada.
- A consulta administrativa de status não pode expor QR/copia-e-cola a outro estabelecimento nem a usuário sem permissão para o pedido.

### E-mail técnico do Pix

- No checkout público, remover a validação e o campo de e-mail para Pix automático.
- O backend cria um e-mail técnico aleatório e sintaticamente válido, por exemplo `pix-<identificador-aleatorio>@<dominio-controlado>`.
- O domínio vem exclusivamente de variável de ambiente validada no servidor. Nenhum domínio de terceiros, e-mail do cliente ou e-mail técnico é mostrado como dado de contato do cliente.
- O e-mail técnico é usado somente no payload exigido pelo Mercado Pago. O sistema não o salva em `clientes.email` e não sobrescreve um e-mail real já cadastrado.
- Se o domínio técnico não estiver configurado, a criação deve falhar de modo claro para o administrador; nunca usar fallback público/inventado de domínio alheio.

## Alternativas avaliadas

1. **Reutilizar a infraestrutura Pix atual (escolhida):** unifica webhook, consulta de contingência, estoque e proteção contra duplicidade entre cardápio e Central.
2. Implementar Pix simplificado só no modal: exigiria um segundo mecanismo de confirmação/estoque, com maior risco de divergência.
3. Gerar QR no frontend: rejeitada, pois exporia credenciais e permitiria adulterar valor/pedido.

## Experiência de uso

- Em balcão e retirada, **Pix manual** significa que a equipe confirma o recebimento fora do QR automático. Em delivery, **Pix na entrega** deixa o pagamento pendente para recebimento na entrega. Nenhuma dessas opções gera QR nem bloqueia a cozinha.
- A opção **Pix automático** só aparece quando o estabelecimento ativou Pix automático e conectou Mercado Pago. Caso contrário, a UI explica que é necessário configurar Pagamentos e Pix.
- Depois de gerar, o modal mostra valor, pedido, prazo real de 30 minutos, QR e copia-e-cola. Fechar o modal não cancela a cobrança; o pedido pendente pode ser aberto novamente pela Central para acompanhar ou gerar uma nova cobrança após expirar/falhar.
- Pedidos pendentes de Pix são distinguíveis na Central e não aparecem como prontos para preparo/cozinha até aprovação.
- Erros não expõem token, resposta bruta do Mercado Pago, e-mail técnico ou dados de outro tenant.

## Critérios de aceite

1. Em balcão/retirada, a Central apresenta Pix manual e Pix automático; em delivery, Pix na entrega e Pix automático. Usuário de outro tenant não acessa a cobrança.
2. Uma ação repetida não cria cobrança duplicada; valor é sempre calculado no banco.
3. Pedido Pix pendente não é enviado/imprimido na cozinha; aprovação libera uma vez e baixa estoque uma vez.
4. Falha/expiração libera reserva e não envia à cozinha; nova cobrança é deliberada e rastreável.
5. Cardápio público gera Pix automático sem campo ou validação de e-mail do cliente.
6. O e-mail técnico usa domínio configurado no servidor, não altera e-mail do cliente e não aparece em UI/logs.
7. Testes cobrem autorização, tenant isolation, duplicidade, aprovação/falha/expiração, estoque, webhook, consulta de contingência e ausência de domínio técnico; lint, tipos e build passam.

## Fora do escopo

- Pix com validade real de cinco minutos usando a integração online atual.
- Alterar a modalidade contratada/configurada do Mercado Pago para solução presencial.
- Envio de QR por WhatsApp, divisão de pagamento, reembolso e conciliação financeira avançada.

## Referência

- A documentação do Mercado Pago para Pix via Orders informa validade mínima de 30 minutos para esta modalidade: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix?scope=prod

## Revisão da especificação

- [x] Escopo de Pix presencial e e-mail técnico separados da investigação de cinco minutos.
- [x] Nenhum QR é gerado pelo navegador ou com valor fornecido pelo cliente.
- [x] O e-mail técnico não se torna dado de contato do cliente.
- [x] Aprovação, falha e expiração têm efeitos explícitos em cozinha e estoque.
