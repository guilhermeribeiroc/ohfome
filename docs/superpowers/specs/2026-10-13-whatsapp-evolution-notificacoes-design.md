# Design: WhatsApp por Evolution API e atualizações de pedidos

**Data:** 2026-10-13  
**Status:** proposta aprovada em conversa para revisão escrita antes da implementação  
**Escopo:** esta etapa do OhFome cobre somente a interface administrativa de WhatsApp e seu contrato de integração. Backend da integração, Evolution API e deploy/configuração na VPS ficam a cargo do Cláudio; este documento fornece requisitos e sequência de handoff. Não inclui atendimento conversacional nem importação de mensagens recebidas.

## Objetivo

Permitir que cada restaurante conecte seu próprio número de WhatsApp por QR Code e, se ativar a opção, envie atualizações privadas do pedido ao cliente. A integração deve respeitar consentimento explícito, isolamento multi-tenant e continuar processando mensagens sem depender de uma aba do painel aberta.

## Experiência do administrador

- A entrada ficará em **Configurações → Conexões → WhatsApp**. Hoje o projeto tem uma página de Configurações com cartões separados, mas não uma página “Conexões”; esta funcionalidade introduzirá esse agrupamento sem misturar o WhatsApp transacional com o número de atendimento do cardápio.
- Somente administrador pode criar/reconectar/desconectar a instância e alterar a automação.
- A página mostra estado da conexão, número conectado quando disponibilizado pela Evolution, ação para conectar/reconectar por QR, ação para desconectar e um controle “Enviar atualizações automáticas do pedido”.
- QR é transitório e mostrado somente ao administrador que iniciou a conexão; não é persistido nem registrado em logs. A chave global da Evolution nunca é enviada ao navegador.
- Quando o serviço ou suas variáveis de servidor não estiverem configurados, a página explica que a integração está indisponível, sem quebrar os demais módulos.
- A página mostra tentativas recentes com pedido/status, horário e resultado. O resultado “aceita pela Evolution” não será apresentado como confirmação de entrega ou leitura pelo destinatário.

## Experiência do cliente e consentimento

- No checkout público, a caixa de consentimento para receber atualizações começa desmarcada. O cliente precisa marcar explicitamente “Quero receber atualizações deste pedido pelo WhatsApp”.
- O aceite é salvo no registro do cliente e no pedido associado; somente um pedido com telefone válido e consentimento explícito pode originar mensagens.
- O consentimento continua editável nos formulários de cliente existentes. Não se enviam mensagens para pedidos antigos sem aceite explícito.
- A automação cobre cinco momentos: pedido recebido (`novo`), em preparo (`em_preparo`), pronto (`pronto`), saiu para entrega (`saiu_para_entrega`) e finalizado. Para delivery, a mensagem de finalização usa a linguagem “entregue”; nos demais canais, usa “pedido finalizado”.
- Mensagens usam o primeiro nome, número do pedido, nome do restaurante e o status. A personalização de modelos fica fora desta primeira versão.

## Opções de arquitetura consideradas

1. **Chamada síncrona na rota de mudança de status:** menos infraestrutura, mas torna a atualização do pedido dependente da disponibilidade externa e pode perder avisos depois de salvar o status.
2. **Outbox persistente no PostgreSQL e worker no servidor (escolhida):** grava a intenção de envio na mesma transação da mudança de status, com deduplicação, leasing e tentativas controladas. O worker acompanha o processo Node já executado pelo contêiner atual; não requer Redis. O bloqueio de linhas permite mais de uma réplica sem processar o mesmo evento ao mesmo tempo.
3. **Fila externa com Redis/BullMQ:** escala independente e painel de fila mais completo, mas adiciona serviço, segredo e operação desnecessários para o volume inicial.

## Arquitetura e fluxo de dados

### Conexão do número

- `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` são variáveis do servidor; a configuração é central para todos os restaurantes. A aplicação gera um nome de instância aleatório e único por estabelecimento, registra esse identificador no tenant e realiza chamadas sempre com a instância daquele tenant.
- Rotas administrativas autenticadas fazem a criação/conexão por QR, consulta de estado e desconexão. A API verifica o usuário e deriva a instância da sessão/tenant; o cliente não pode fornecer livremente nome de instância ou destino de rede.
- A implementação ficará atrás de um adaptador `EvolutionApiClient`, para encapsular diferenças entre versões. A documentação atual da Evolution descreve criação/conexão e consulta de estado da instância; a documentação v2 descreve envio de texto por `message/sendText/{instance}`. A versão instalada/configurada deverá ser testada antes de ativar o envio real.
- Não se configura webhook de mensagens recebidas nesta fase: ele não é necessário para enviar status. Estado e QR são consultados pela aplicação com limite de tempo.

### Eventos de status

- Uma tabela de outbox registra `estabelecimento_id`, `pedido_id`, estado, fila, tentativas, próxima tentativa, lease, horários, erro sanitizado e identificador de resposta do provedor quando disponível. Ela não persiste telefone nem cópia de mensagem.
- Uma restrição única por pedido e status impede que uma repetição de PATCH ou polling gere dois eventos lógicos iguais.
- Um trigger transacional em `pedidos` cobre inserção e mudança de `status`, incluindo pedido público criado pela função SQL e finalização feita pelo painel Delivery. Ele só gera evento quando o cliente está associado, tem telefone, consentimento explícito e o estabelecimento habilitou a automação.
- Se o administrador desativar a automação, novas transições não criam notificações e notificações pendentes são marcadas como ignoradas, mantendo o histórico. Reativar não dispara retroativamente estados antigos.

### Worker e confiabilidade

- Worker Node iniciado junto do servidor Next no contêiner. A cada ciclo, reivindica pequenos lotes em transação com `FOR UPDATE SKIP LOCKED`, marca lease e envia fora da transação; o processo não segura locks de banco durante a chamada HTTP.
- Antes de enviar, o worker confirma novamente que a automação do restaurante continua ativa, que o consentimento do cliente segue válido e que há telefone/instância. Se consentimento foi revogado enquanto a notificação aguardava, ela é marcada ignorada. Telefone e texto só ficam em memória durante o envio e nunca vão para logs.
- Retentativas exponenciais limitadas para respostas em que é seguro concluir que o provedor não aceitou o envio. Falhas permanentes vão para estado de falha visível e podem ser tentadas manualmente pelo administrador.
- Timeout de rede após envio é ambíguo: como a API documentada não promete idempotência por chave, a fila marca o evento como “resultado incerto” e não o reenviará automaticamente, evitando duplicatas; o admin decide uma tentativa manual.
- O cliente não recebe garantia de entrega/leitura. Sem confirmação via webhook de estado de mensagem, o sucesso significa apenas resposta de aceitação da Evolution.
- Se a instância estiver desconectada ou o servidor externo indisponível, o pedido e seu status são persistidos normalmente; a fila sinaliza falha/atraso e tenta novamente dentro da política definida.

## Dados, segurança e isolamento

- Migration aditiva: metadados de conexão/automação por estabelecimento; outbox e histórico; índices de consulta/claim; trigger/funções necessárias; RLS e privilégios de menor acesso.
- Todas as rotas de aplicação usam `comEstabelecimento`. A operação global de claim será encapsulada numa função de banco restrita, com campos mínimos e `search_path` fixo; não se concederá `BYPASSRLS` à role de aplicação.
- Apenas o URL e chave global da Evolution são segredos de ambiente do servidor. Não armazenar chaves de API por restaurante. QR e corpo de mensagens não aparecem em logs de aplicação; erros externos são limitados e sanitizados.
- URLs da Evolution são exclusivamente configuração de servidor, para evitar SSRF via input de tenant. Em produção exigem HTTPS; desenvolvimento pode usar localhost.
- Telefone é normalizado para DDI + DDD + número antes do envio. Números inválidos geram resultado de falha, sem chamada ao provedor.

## Escopo de implementação

- **Nesta etapa (Dimitre/Codex):** página `/configuracoes/conexoes/whatsapp` em Configurações → Conexões; estados de desconectado/conectando/conectado/erro; apresentação de QR temporário, instrução de escaneamento, número conectado, ação de desconectar/reconectar, toggle de automação e histórico/erros que o backend disponibilizar. No checkout, deixar o consentimento de WhatsApp desmarcado por padrão e enviar `notificar: boolean` no pedido público. A interface deve funcionar em desktop e celular, ter estados de carregamento/vazio/erro e não simular sucesso se o backend ainda não estiver instalado.
- **Contrato para a UI:** a tela dependerá de endpoints autenticados do OhFome para consultar estado/configuração, iniciar conexão e receber QR, desconectar, atualizar o toggle e consultar histórico. Respostas terão formato estável e sanitizado; segredos globais e URL administrativa da Evolution nunca serão enviados ao browser. O backend deverá impor autorização de administrador e escopo do tenant. A interface poderá ser desenvolvida com dados mockados, mas só será integrada/testada de ponta a ponta quando o Cláudio disponibilizar esses endpoints.
- **A cargo do Cláudio (backend OhFome + VPS):** implementar os endpoints e persistência/worker/outbox descritos na arquitetura; provisionar Evolution API em serviço Docker separado do contêiner Next; configurar persistência, banco/Redis exigidos pela versão escolhida, domínio HTTPS, firewall/rede privada, chave mestra como segredo no servidor e backup/monitoramento; aplicar migrations; testar conexão por QR e envio em homologação antes de habilitar produção.
- **Consentimento e status:** checkout deve manter opt-in desmarcado por padrão e persistir o consentimento explícito ligado ao pedido. A automação só envia os cinco estados definidos neste design. Não presumir consentimento de clientes/pedidos existentes.
- **Testes desta etapa:** componentes da tela com estados de carregamento, QR, conexão, falha e automação; autorização/isolamento e segurança do backend, consentimento, eventos/outbox, retentativas e Evolution real ficam no checklist de entrega do Cláudio. Nenhum teste local com mock será descrito como certificação do envio real.

## Plano de execução e handoff

1. **Interface OhFome:** criar a seção Configurações → Conexões → WhatsApp e os estados visuais/responsivos; usar o contrato de API acordado abaixo e fixtures apenas durante desenvolvimento.
2. **Integração backend:** Cláudio cria endpoints autenticados multi-tenant, persistência e outbox/worker, respeitando consentimento, deduplicação, sanitização e a política de falhas deste design.
3. **Serviço VPS:** Cláudio provisiona Evolution em Docker separado, com versão fixada, volumes persistentes, serviços auxiliares requeridos pela versão, HTTPS, firewall e segredo de API fora do repositório; Next fala com Evolution por rede privada sempre que possível.
4. **Homologação:** Cláudio valida migrations/backup, QR e reconexão, desconexão, consentimento, as cinco transições, duplicidade, falhas e logs sem PII. Só depois da validação o recurso pode ser habilitado para restaurantes.
5. **Entrega:** registrar URL/versionamento do serviço (sem divulgar chave), variáveis necessárias, procedimento de backup/restore, health checks, logs/alertas, rollback e evidências dos testes. Nenhuma chave ou QR deve ser copiada para documentação, chat ou frontend.

### Contrato mínimo de API para o frontend

Os caminhos são propostas para alinhamento e podem ser ajustados pelo backend antes da integração; formatos e garantias devem permanecer equivalentes.

| Operação | Endpoint proposto | Resposta essencial |
|---|---|---|
| Ler estado e preferência | `GET /api/configuracoes/conexoes/whatsapp` | `status`, `connected`, `phone`, `automationEnabled`, `qrCodeDataUrl`, `qrExpiresAt`, `updatedAt` |
| Iniciar/reiniciar conexão | `POST /api/configuracoes/conexoes/whatsapp/connect` | mesmo tipo de conexão, QR como data URL e expiração; endpoint protegido contra chamadas concorrentes |
| Atualizar preferência | `PATCH /api/configuracoes/conexoes/whatsapp` | recebe e retorna `{ automationEnabled }`; servidor valida sessão ativa antes de habilitar |
| Desconectar | `DELETE /api/configuracoes/conexoes/whatsapp` | estado atualizado desconectado; operação idempotente |
| Consultar histórico | `GET /api/configuracoes/conexoes/whatsapp/events?limit=10` | `{ items, nextCursor }`, itens com id, pedido, status, horário e resultado sanitizado, sem telefone/corpo |

Contrato consumido pelo frontend implementado: `GET` retorna `{ status, connected, phone, automationEnabled, qrCodeDataUrl, qrExpiresAt, updatedAt }`; status da conexão é `disconnected | connecting | connected | error`. `POST .../connect` retorna esse mesmo objeto. `PATCH` aceita `{ automationEnabled }` e retorna a preferência efetiva. `DELETE` retorna o objeto atualizado. Histórico retorna `{ items: [{ id, orderCode, status, createdAt, outcome }], nextCursor }`, com `status = novo | em_preparo | pronto | saiu_para_entrega | finalizado` e `outcome = pending | accepted | failed | uncertain | ignored`. QR deve ser uma data URL de imagem temporária; datas ISO-8601. Campos não aplicáveis podem ser `null`. Erro usa `{ erro, codigo? }` e 404 `WHATSAPP_INTEGRATION_NOT_CONFIGURED` pode indicar que o backend não foi implantado.

O checkout já envia `notificar` na criação do pedido; a UI agora o inicializa como `false` e apresenta consentimento explícito apenas para atualizações por WhatsApp. O backend deve tratar o valor como consentimento específico daquele pedido (snapshot), nunca inferi-lo do perfil de cliente nem usar a preferência armazenada no cliente para autorizar pedidos antigos. Manter o `notificar` do cliente somente como preferência separada, se ainda necessário a outros fluxos.

Todos os endpoints exigem sessão válida e papel de administrador, derivam o estabelecimento da sessão e não aceitam tenant/instância arbitrários do cliente. O QR expira e não deve ser armazenado em histórico, cache compartilhado ou logs. Respostas de erro expõem código/mensagem seguros para a UI, nunca stack trace, chave ou payload bruto do provedor.

## Critérios de aceite

1. Administrador de um estabelecimento consegue gerar QR e consultar conexão sem ver credenciais ou QR de outro tenant.
2. A automação fica inativa por padrão e só pode ser ativada para um restaurante conectado.
3. A caixa do checkout começa desmarcada; sem consentimento nenhum evento é criado ou enviado.
4. Com consentimento, as cinco mudanças criam eventos únicos na mesma transação dos pedidos/status; uma falha de Evolution não reverte o pedido.
5. O worker processa o outbox sem aba do browser, não mantém transação durante HTTP, aplica backoff, expõe falhas e impede reenvio automático ambíguo.
6. Desativar para novos eventos ignora pendências antigas de modo rastreável; nenhuma mensagem é disparada retroativamente ao reativar.
7. Testes automatizados/mockados passam; `npm run lint` e `npm run build` passam. Envio real permanece não certificado até configurar e testar a versão real do Evolution em homologação.

## Fora do escopo desta etapa de interface

- Implementar backend, worker, migration/outbox e endpoints de produção; provisionar, atualizar ou operar a Evolution/VPS. Esses itens fazem parte do handoff do Cláudio, não da entrega frontend.
- Receber e responder mensagens, bot de atendimento, grupos, catálogo no WhatsApp, templates editáveis, disparos promocionais, pagamento por mensagem e relatórios analíticos.
- Garantia de que a Evolution ou o WhatsApp entregou/leu a mensagem ao cliente.

## Referências técnicas

- Evolution API, conexão e estado de instância: https://docs.evoapicloud.com/api-reference/instance-controller/instance-connect e https://docs.evoapicloud.com/api-reference/instance-controller/connection-state
- Evolution API v2, envio de texto: https://github.com/evolution-foundation/evolution-docs/blob/main/docs/05-Endpoints/00-send-plain-text.md

## Revisão da especificação

- [x] Nenhum placeholder/TODO deixado sem decisão.
- [x] Opt-in explícito e instância central gerenciada são decisões confirmadas pelo usuário.
- [x] Divisão de responsabilidade atualizada: interface nesta etapa; backend OhFome e Evolution/VPS a cargo do Cláudio.
- [x] Requisitos de VPS, sequência de homologação e contrato mínimo esperado pela UI registrados para handoff.
- [x] Os estados finais diferenciam delivery (`entregue`) de outros canais (`finalizado`).
- [x] A especificação não promete entrega/leitura nem exactly-once externo; timeouts ambíguos são apresentados ao admin.
- [x] Nenhuma chamada externa real ou produção está no escopo desta fase.
