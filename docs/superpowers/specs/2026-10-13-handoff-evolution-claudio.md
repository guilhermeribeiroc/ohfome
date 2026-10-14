# Handoff para Cláudio: WhatsApp/Evolution no OhFome

**Data:** 2026-10-13  
**Documento de referência:** [design completo](2026-10-13-whatsapp-evolution-notificacoes-design.md)

## Divisão combinada

- Dimitre/Codex: implementar somente a interface OhFome em **Configurações → Conexões → WhatsApp**, incluindo QR temporário, estado/número da sessão, reconectar/desconectar, toggle de automações e histórico/erros.
- Cláudio: implementar os endpoints e toda a integração de backend, banco/fila/worker, instalar e configurar Evolution API na VPS, fazer deploy e homologar o fluxo real.
- A interface não deve fingir que conectou ou que enviou mensagens: antes dos endpoints, usar mocks apenas em testes locais claramente isolados.

## Comportamento funcional esperado

1. Cada restaurante conecta seu próprio número escaneando QR, mas a URL e a chave global da Evolution são centralizadas em segredos do servidor.
2. A conexão e o toggle são isolados por estabelecimento e só podem ser administrados por usuários administradores autenticados.
3. A automação vem desativada. O checkout pede opt-in explícito, desmarcado por padrão. Sem consentimento gravado para aquele pedido, não há envio.
4. Eventos: pedido recebido (`novo`), em preparo, pronto, saiu para entrega e finalizado (mensagem “entregue” no delivery).
5. Falha ao enviar mensagem não pode desfazer pedido ou mudança de status. A UI deve expor estado pendente/falha/resultado incerto sem afirmar entrega/leitura.

## Contrato proposto para desbloquear o frontend

Favor confirmar ou ajustar estes caminhos/formas antes de fechar a integração:

| Operação | Caminho | Payload/resposta mínima |
|---|---|---|
| Estado/preferência | `GET /api/configuracoes/conexoes/whatsapp` | `{ connected, phone, automationEnabled, qr?, updatedAt }` |
| Gerar QR/conectar | `POST /api/configuracoes/conexoes/whatsapp/connect` | `{ status, qr, expiresAt }` |
| Ativar/desativar | `PATCH /api/configuracoes/conexoes/whatsapp` | request `{ automationEnabled }`, response com preferência efetiva |
| Desconectar | `DELETE /api/configuracoes/conexoes/whatsapp` | estado desconectado; idempotente |
| Histórico | `GET /api/configuracoes/conexoes/whatsapp/events` | itens paginados `{ orderCode, status, createdAt, outcome }` |

Requisitos transversais: sessão e papel admin em todas as operações; estabelecimento derivado da sessão, nunca do body; nenhum segredo Evolution no browser; QR com expiração, sem persistir em log/cache/histórico; mensagens/telefones fora de logs; erros sanitizados, sem stack trace/payload cru do provedor.

## Backend e banco

- Criar metadados de conexão/preferência por estabelecimento, tabela outbox/histórico e índices adequados. Migração aditiva, RLS e menor privilégio.
- Registrar o evento na mesma transação da criação/alteração do pedido; incluir todos os caminhos de pedido público, Central e Delivery. Dedupe por pedido + status.
- Worker persistente no servidor, com claim por lotes (`FOR UPDATE SKIP LOCKED`), lease e HTTP fora da transação. Revalidar consentimento e toggle antes do envio.
- Retry limitado com backoff somente para falhas seguramente retryable. Timeout após possível aceitação deve virar resultado incerto e não ser reenviado automaticamente, para evitar duplicata.
- Evolution deve rodar em serviço/container separado do Next, com versão fixada. Provisionar apenas banco/cache/serviços exigidos pela versão escolhida, armazenamento persistente, HTTPS, firewall e rede privada entre aplicação e API sempre que possível.
- Configurar URL/chave Evolution como segredos no ambiente da aplicação. Nunca incluir a chave em Git, imagem frontend, bundle do navegador ou logs.

## Homologação e operação na VPS

Antes de produção, apresentar evidência de:

- backup verificável e plano de restore antes da migration;
- health check, reinício após reboot e persistência dos dados da Evolution;
- conectar, escanear QR, expirar QR, reconectar e desconectar;
- opt-in desmarcado, consentimento persistido e bloqueio de envio sem aceite;
- todas as cinco etapas, dedupe, falhas, retry, timeout incerto e desligamento da automação;
- isolamento entre dois estabelecimentos e autorização somente admin;
- logs sem telefone, corpo da mensagem, QR ou chave;
- monitoramento/alerta de serviço e fila, procedimento de rotação de segredo e rollback.

Registrar versão da Evolution, nomes das variáveis necessárias, serviços/portas internos, domínio/certificado, backup/restore e rollback. Não anexar valores de segredos a este handoff.

## Referências

- [Guia de instalação Docker Evolution v2](https://github.com/evolution-foundation/docs-evolution/blob/main/v2/en/install/docker.mdx)
- [Compose oficial Evolution](https://github.com/evolution-foundation/evolution-api/blob/main/docker-compose.yaml)
- [Conexão de instância](https://docs.evoapicloud.com/api-reference/instance-controller/instance-connect)
- [Estado da conexão](https://docs.evoapicloud.com/api-reference/instance-controller/connection-state)
- [Envio de texto](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/05-Endpoints/00-send-plain-text.md)

As rotas e payloads da Evolution variam entre versões; validar contra a versão fixada na VPS e manter essa diferença encapsulada no backend do OhFome.
