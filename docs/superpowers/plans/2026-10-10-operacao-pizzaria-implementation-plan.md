# Plano de implementação — operação da pizzaria

**Especificação aprovada:** [Melhorias de operação da pizzaria](../specs/2026-10-10-operacao-pizzaria-design.md)
**Base:** `master` em `2085c5a` (documentação) / `b2372d8` (código)
**Escopo:** balcão, clientes, entregadores, estoque por unidade, cardápio público, importação por foto, impressão de cozinha e uso dos bairros já existentes.

## Princípios e ordem de segurança

- Implementar primeiro as regras transacionais no PostgreSQL e no servidor; a interface nunca calcula preço, taxa ou saldo definitivo.
- A migration seguinte é `033_operacao_pizzaria.sql`. O arquivo local não rastreado `029_sincroniza_codigo_pedido.sql` não é parte desta entrega e não deve ser incorporado ou sobrescrito.
- Todas as tabelas novas carregam `estabelecimento_id`, índices de tenant e chaves compostas quando um vínculo puder cruzar estabelecimentos.
- Produtos existentes iniciam com o controle unitário desligado. Nenhum saldo é inferido por vendas históricas.
- Não habilitar o controle em produção enquanto qualquer endpoint que venda o produto ainda ignorar a disponibilidade.
- Inserir testes automatizados antes das mudanças de alto risco. Como o projeto ainda não possui script de testes, escolher e configurar uma única camada leve (por exemplo, Vitest para regras/rotas e um PostgreSQL efêmero ou base de integração isolada); não usar produção como ambiente de teste.

## Fase 0 — Base de testes e contratos compartilhados

**Arquivos principais:**

- Criar a configuração e scripts de teste em `web/package.json` e arquivos de configuração correspondentes.
- Criar `web/src/lib/operacao-pedido.ts` para validações puras de modalidade, transição e payload.
- Criar `web/src/lib/estoque-unidades.ts` para contratos/erros compartilhados no servidor.
- Atualizar `web/src/lib/types.ts` com modalidades, disponibilidade, compromisso, movimento e entregador atribuído.

**Tarefas:**

1. Definir tipos explícitos para `balcao_imediato`, `retirada` e `delivery`, separando modalidade de status do pedido e de status do pagamento.
2. Criar testes de tabela para regras puras: quais campos cada modalidade exige, quais transições são legais e quais destinos imprimem cozinha.
3. Definir erros de domínio estáveis (`ESTOQUE_INSUFICIENTE`, `CHAVE_IDEMPOTENCIA_EM_USO`, `ENTREGADOR_OBRIGATORIO`, `TAXA_DESATUALIZADA`) e mapear cada um para HTTP/mensagem de interface sem vazar dados internos.
4. Acrescentar um helper de transação com isolamento e bloqueio de linhas usando o cliente PostgreSQL já adotado; ele será o único caminho para efeitos de estoque desta entrega.
5. Preparar fixtures de dois estabelecimentos, produtos controlados/não controlados, bairros, entregadores e pedidos em estados diferentes.

**Validação:** os testes rodam sem credenciais de Anthropic, Mercado Pago, QZ ou VPS e provam isolamento entre dois estabelecimentos.

## Fase 1 — Migration e núcleo de estoque por unidade

**Arquivos:**

- Criar `database/migrations/033_operacao_pizzaria.sql`.
- Atualizar `database/schema.sql` com a estrutura consolidada, funções, grants e comentários necessários.
- Criar `web/src/lib/estoque-unidades.ts` e seus testes de integração.

**Estrutura de dados:**

1. Adicionar a `produtos` somente os metadados de ativação do controle unitário, sem reaproveitar a quantidade de `insumos`.
2. Criar uma tabela de saldo por `produto_id` e `estabelecimento_id`, com saldo físico não negativo, `updated_at` e chave composta que comprova a posse do produto.
3. Criar tabela de movimentações auditáveis (`entrada`, `ajuste`, `compromisso`, `consumo`, `liberacao`), incluindo operador, motivo, pedido/item quando houver, quantidade assinada, saldo resultante e data.
4. Criar tabela de compromissos de unidade por item de pedido, com estado que impeça consumir ou liberar duas vezes. Usar unicidade por item/efeito, não uma marca apenas no navegador.
5. Criar tabela de idempotência para criação interna de pedidos, vinculada a estabelecimento, chave, hash do conteúdo e pedido resultante. Uma repetição igual devolve o mesmo pedido; uma chave com conteúdo diferente retorna conflito.
6. Acrescentar ao pedido/entrega os campos de snapshot necessários para modalidade, cliente, bairro, taxa, responsável pela entrega e auditoria, usando migração aditiva e preenchendo apenas valores que possam ser determinados sem inventar histórico.
7. Alterar `clientes.telefone` para aceitar `NULL`; normalizar telefones reais antes de validar unicidade por estabelecimento. Produzir relatório de colisões antes de impor qualquer índice novo e não fundir cadastros automaticamente.
8. Proibir ativar estoque unitário quando houver ficha técnica ativa para o mesmo produto e vice-versa. Usar constraint/trigger e validação de API, para que nenhum canal possa descontar produto e insumo duas vezes.
9. Criar funções transacionais privadas para: adicionar, ajustar contagem física, comprometer itens agregados, converter compromisso em consumo e liberar antes do preparo. Bloquear saldos em ordem estável (`produto_id`) antes de validar disponibilidade.
10. Atualizar a função pública `fn_criar_pedido_publico` e os respectivos `REVOKE`/`GRANT` para usar o núcleo de compromissos; manter assinatura e permissões coerentes com a rota pública.

**Regras verificadas no banco:**

- disponibilidade = saldo físico − compromissos abertos;
- ajuste físico abaixo dos compromissos é recusado;
- saldo e compromissos nunca ficam negativos;
- itens repetidos do mesmo produto são agregados antes do bloqueio;
- cancelamento pré-preparo libera uma vez, finalização consome uma vez e pós-preparo não devolve automaticamente;
- vendas históricas não executam baixa do estoque atual;
- exclusão física de pedido com movimento/compromisso é rejeitada.

**Validação:** testes de integração PostgreSQL para última unidade concorrente, múltiplos produtos, retry, duas tenants, ajuste abaixo do comprometido, cancelamento repetido e ativação conflitando com ficha técnica.

## Fase 2 — Serviço de criação de pedidos e atendimento de balcão

**Arquivos:**

- Refatorar `web/src/app/api/pedidos/route.ts`.
- Refatorar `web/src/app/api/pedidos/[id]/route.ts`.
- Criar, se a extração deixar os handlers menores, `web/src/lib/criar-pedido-interno.ts` e `web/src/lib/transicoes-pedido.ts`.
- Atualizar `web/src/components/pedidos/KanbanBoard.tsx` e extrair um componente de atendimento somente se necessário.
- Atualizar `web/src/lib/types.ts`.

**Tarefas:**

1. Fazer a criação interna buscar no banco preço, disponibilidade, produto, adicionais e taxa de bairro. Rejeitar total, taxa, status, estoque ou cliente forjado pelo cliente web.
2. Aplicar a chave de idempotência em todas as criações de balcão. Ao receber retry, retornar o número e o estado do pedido já criado sem duplicar itens, financeiro, impressão ou baixa.
3. Implementar venda imediata como operação específica: confirmação explícita de entrega/recebimento, pedido finalizado, consumo imediato do estoque e nenhuma criação de job de cozinha. O financeiro continua derivando do pedido finalizado, sem lançamento paralelo.
4. Implementar retirada como pedido novo enviado à cozinha, sem entrega/entregador, finalizado somente quando o balcão confirmar a retirada.
5. Implementar delivery interno com cliente/endereço/bairro e taxa resolvidos no servidor; guardar snapshot de endereço, bairro e taxa naquele pedido.
6. Manter mesas/comandas e os fluxos existentes; validar que permissões não permitem a um papel de balcão executar operações administrativas ou de mesa não autorizadas.
7. Fazer cancelamento e transições chamar o mesmo serviço de estoque. A mudança de status feita por botão, arraste, lote ou endpoint direto deve produzir o mesmo efeito uma única vez.
8. Exibir confirmação clara de venda imediata mesmo fora do Kanban ativo e impedir duplo clique enquanto a requisição está em curso.

**Validação:** testes de API e interface para venda imediata, retirada, delivery, pagamento dividido, taxa de entrega, falha no meio da transação e perda de conexão/retry.

## Fase 3 — Busca de clientes e bairros no atendimento

**Arquivos:**

- Criar `web/src/app/api/clientes/busca/route.ts`.
- Atualizar `web/src/app/api/pedidos/route.ts` e as funções de cliente no banco conforme a migration.
- Criar ou extrair `web/src/components/pedidos/BuscaCliente.tsx`.
- Atualizar `web/src/components/pedidos/KanbanBoard.tsx`.
- Reutilizar as rotas existentes de bairros em `web/src/app/api/entrega/bairros/` sem ampliar permissão de edição.

**Tarefas:**

1. Fornecer busca autenticada por nome ou telefone normalizado, limitada, com escopo de estabelecimento e autorização de atendimento. Retornar somente nome, telefone, endereço e referência estritamente necessários.
2. Implementar debounce, cancelamento de resposta antiga e lista que desambigua homônimos por telefone/endereço. Não exibir telefones artificiais antigos como contatos reais.
3. Ao selecionar, preencher o formulário sem alterar o cadastro. Oferecer uma opção explícita para atualizar os dados reutilizáveis após confirmação do atendente.
4. Para novo cliente interno, permitir telefone nulo; para delivery público, preservar telefone válido obrigatório. Sem telefone, não deduplicar automaticamente por nome.
5. Consultar somente bairros ativos no atendimento. O administrador já cadastra nome e taxa em `Delivery → Taxas por bairro`; manter esse recurso e melhorar o feedback somente quando houver erro real.
6. Na confirmação do pedido, recarregar/validar bairro e taxa no servidor. Se a taxa mudou desde a tela, devolver total novo e solicitar confirmação, em vez de cobrar o valor antigo.

**Validação:** nomes iguais, telefone normalizado, dois estabelecimentos, bairro desativado, taxa alterada durante atendimento e pedido histórico preservado após atualizar o cadastro.

## Fase 4 — Entregadores e saída para entrega atômica

**Arquivos:**

- Atualizar `web/src/app/api/entregadores/route.ts` e `web/src/app/api/entregadores/[id]/route.ts` conforme permissões já existentes.
- Unificar regras em `web/src/app/api/entregas/[id]/route.ts` e `web/src/app/api/pedidos/[id]/route.ts` ou em um serviço de expedição compartilhado.
- Atualizar `web/src/components/delivery/DeliveryModule.tsx` e cartões/detalhes de pedido que mostrem a entrega.

**Tarefas:**

1. Preservar cadastro nominal atual e permitir gestão apenas a administrador/equipe de delivery autorizada.
2. Tornar a seleção de entregador obrigatória antes de marcar `saiu_para_entrega`, por botão, arraste ou API direta. Validar estado pronto, pedido ativo, entregador ativo e mesmo estabelecimento.
3. Executar atualização de pedido, entrega, vínculo do entregador e auditoria em uma transação única.
4. Mostrar entregador e carga ativa no cartão e na via de entrega, sem converter automaticamente a disponibilidade manual em verdade do banco.
5. Derivar a ocupação das entregas abertas: o mesmo entregador pode ter vários pedidos e só fica sem carga após o último concluir/cancelar.
6. Bloquear exclusão de entregador com entrega ativa; desativação preserva o histórico e impede novas atribuições.

**Validação:** tentativa sem entregador, entregador de outra tenant/inativo, dois pedidos para a mesma pessoa, arraste e chamada API com a mesma regra, conclusão/cancelamento em ordens diferentes.

## Fase 5 — Estoque operacional no painel e disponibilidade pública

**Arquivos:**

- Atualizar `web/src/components/estoque/EstoqueModule.tsx` e `web/src/components/estoque/PrecificacaoCalculadora.tsx`.
- Criar endpoints autenticados em `web/src/app/api/estoque/produtos/` para configuração, entrada, ajuste e consulta.
- Atualizar `web/src/app/api/produtos/route.ts` e `web/src/app/api/produtos/[id]/route.ts` caso sejam os contratos já usados para produto.
- Atualizar `web/src/app/api/publico/[slug]/route.ts` e criar uma resposta enxuta de disponibilidade se ela não couber no contrato do catálogo.
- Atualizar `web/src/components/cardapio-publico/CardapioPublico.tsx` e tipos públicos.

**Tarefas:**

1. Para produtos habilitados, mostrar saldo físico, comprometido e disponível; para os demais, manter o comportamento atual sem exibir zero falso.
2. Criar ações distintas de **Adicionar unidades** e **Ajustar contagem**, ambas com motivo, operador e confirmação. A tela mostra o impacto antes de enviar; o banco toma a decisão final.
3. Requerer reconciliação explícita de pedidos ativos antes de ativar/desativar o controle; nunca zerar diariamente.
4. Retornar apenas disponibilidade pública necessária e sem cache compartilhado. Fazer polling a cada 10 segundos somente com a página visível, ao ganhar foco, abrir checkout e após conflito.
5. Exibir `N disponíveis` para produto controlado e `Esgotado` para zero. Desativar adição, incremento e envio para o item esgotado, mas não escondê-lo.
6. Na validação final de carrinho, devolver item e saldo atual se outra venda venceu a disputa. Não reduzir quantidade nem cobrar parcialmente sem confirmação do cliente.
7. Aplicar essa verificação a delivery público, balcão, mesa, retirada, adicionais e fechamento de comanda, com uma única chamada às regras de estoque.

**Validação:** inserir 20 latas, vender em canais mistos até zero, repor, atualizar duas abas, conflito na última unidade e produto sem controle funcionando como antes.

## Fase 6 — Pix automático e reconciliação de reservas

**Arquivos:**

- Atualizar `web/src/lib/mercado-pago.ts`.
- Atualizar `web/src/app/api/publico/[slug]/pedidos/route.ts`.
- Atualizar `web/src/app/api/webhooks/mercado-pago/route.ts`.
- Criar serviço/endpoint operacional autenticado de reconciliação limitado, ou integrar no mecanismo de tarefa de servidor já existente após confirmar sua execução persistente.
- Atualizar as tabelas/funções Pix existentes em `database/schema.sql` e migration 033 somente de forma aditiva.

**Tarefas:**

1. Para Pix automático, criar reserva temporária de estoque antes de solicitar a cobrança e remover a reserva se a criação falhar. Não enviar o pedido à cozinha antes de confirmação do provedor.
2. No webhook consultado e validado, converter reserva em compromisso exatamente uma vez e liberar cozinha exatamente uma vez; tratar webhooks duplicados e fora de ordem.
3. Em rejeição/expiração confirmada pelo provedor, cancelar pedido não iniciado e liberar uma vez.
4. Criar reconciliação observável e limitada que consulta pendências sem depender de navegador. Se o estado remoto é desconhecido, manter reserva e sinalizar para operação, em vez de liberar pelo relógio local.
5. Não emitir estorno financeiro automático, não reabrir cozinha por confirmação tardia e não ultrapassar estoque disponível; casos tardios entram em revisão operacional.

**Validação:** provedor simulado para criação falha, aprovado, rejeitado, expirado, webhook repetido/fora de ordem e indisponibilidade transitória; uma execução sem aba aberta comprova a reconciliação.

## Fase 7 — Importação revisável do cardápio por foto

**Arquivos:**

- Atualizar `web/src/app/api/produtos/importar-cardapio/route.ts`.
- Atualizar `web/src/lib/importar-cardapio.ts`.
- Atualizar `web/src/app/api/produtos/lote/route.ts`.
- Atualizar `web/src/components/estoque/PrecificacaoCalculadora.tsx` e extrair modal/estado de revisão se ele estiver misturado ao formulário.

**Tarefas:**

1. Manter o limite de seis fotos, 8 MB por imagem, tipos reais JPG/PNG/WebP e adicionar limites para 48 MB combinados e envelope multipart. Nenhum texto dentro da imagem muda instruções ou permissões do sistema.
2. Validar configuração do provedor apenas no servidor e oferecer erros recuperáveis para ausência de chave, timeout, imagem ilegível, indisponibilidade ou extração incompleta; a tela sempre sai de carregamento.
3. Tratar extração como sugestão: permitir correção de nome, descrição, categoria, P/M/G, preço e exclusão/inclusão antes de gravar.
4. Comparar possíveis duplicidades no lote e no cardápio atual. Exigir ação por item: manter, atualizar explicitamente ou criar novo; similaridade nunca sobrescreve produto sozinha.
5. Limitar confirmação a 100 itens, salvar todo o lote em transação e usar idempotência para não duplicar em reenvio.
6. Produtos importados iniciam sem controle unitário e sem imagem individual gerada da foto do cardápio.

**Validação:** foto legível, nomes/tamanhos ambíguos, rede indisponível, limite excedido, reenvio, conflito de duplicidade e gravação interrompida sem lote parcial.

## Fase 8 — Perfil de impressão grande para cozinha

**Arquivos:**

- Atualizar `web/src/components/cozinha/ImpressaoQzTray.tsx`.
- Atualizar `web/src/lib/impressao.ts`.
- Criar/atualizar testes de formatação de ESC/POS e HTML.
- Atualizar `web/src/app/(app)/configuracoes/impressao/page.tsx` apenas para expor o perfil, se necessário.

**Tarefas:**

1. Adicionar perfil de cozinha `Grande` como padrão, com retorno possível ao normal e mantendo largura 58/80 mm, QZ, estação e fila atuais.
2. Para térmica, imprimir referência com largura/altura dupla e itens/observações com altura dupla, restaurando alinhamento, fonte e negrito ao terminar cada bloco.
3. Para HTML, usar referência de 24 px, itens 18 px e observações 16 px, em alto contraste. Não mudar recibos financeiros ou via do entregador quando não forem via de cozinha.
4. Substituir a quebra atual que trunca palavras longas por quebra integral conforme a largura efetiva da fonte ampliada. Cobrir nome, adicionais e observações.
5. Testar 58 e 80 mm com nome muito longo, quantidade acima de nove, tamanhos e observação extensa; depois homologar fisicamente na impressora que a cliente informar. Não anunciar compatibilidade perfeita com a Tanca sem modelo/porta/driver e teste físico.

**Validação:** snapshots/asserções de comandos e HTML preservam todo texto; teste físico autorizado verifica contraste, corte e leitura em distância de cozinha.

## Fase 9 — Regressão, migration e deploy controlado

1. Executar testes unitários, integração PostgreSQL, testes de API por papel e fluxos ponta a ponta com dados sintéticos; executar `npx tsc --noEmit`, `npm run lint` e `npm run build` em `web/`.
2. Revisar todas as APIs alteradas para autorização, isolamento por estabelecimento, rate limiting aplicável, mensagens de erro e validação de payload.
3. Gerar backup verificável do banco de produção e revisar o SQL 033 numa cópia/ambiente de homologação antes de aplicá-lo na VPS.
4. Aplicar migration 033 antes do código que exige suas estruturas. Verificar constraints, grants, funções públicas e que todos os produtos permanecem sem controle ativado inicialmente.
5. Fazer deploy autorizado e validar em um estabelecimento de teste: balcão imediato, retirada, delivery com entregador, cliente buscado, bairro/taxa, estoque até esgotar, Pix de teste, importação simulada e impressão de teste.
6. Só habilitar controle unitário para produtos depois de contagem física e reconciliação de pedidos ativos. Monitorar erros de conflito/reserva e pendências Pix; manter procedimento de recuperação documentado.

## Matriz de riscos

| Risco | Controle |
| --- | --- |
| Venda duplicada após queda de conexão | Idempotência de criação, transação e resposta do pedido existente. |
| Duas vendas da última unidade | Bloqueio ordenado no banco, compromisso atômico e erro específico de disponibilidade. |
| Estoque duplicado entre ficha técnica e produto | Modos mutuamente exclusivos por produto, validados no banco e API. |
| Pix pendente liberar/preparar incorretamente | Reserva transitória, consulta ao provedor, webhook idempotente e reconciliação observável. |
| Taxa de entrega divergente | Bairro/taxa resolvidos no servidor e snapshot no pedido. |
| Despacho sem responsável | Validação obrigatória e única operação transacional para pedido, entrega e entregador. |
| Importação cria cardápio errado | Revisão humana, duplicidade explícita, limites e gravação transacional. |
| Fonte maior cortar ticket | Quebra sem truncamento, testes 58/80 mm e homologação física. |

## Condições de aceite da entrega completa

- As 14 verificações de aceitação da especificação estão automatizadas quando forem regras de servidor/formatação e validadas manualmente quando exigirem impressora ou provedor externo.
- O atendimento nunca conclui pedido parcial, preço/taxa cliente-controlado, estoque negativo ou entrega sem responsável.
- Produtos não controlados, pedidos antigos, cardápio existente, financeiro, mesas, impressão e integrações continuam operando após a regressão.
- Nenhuma migration é aplicada, credencial é exposta, deploy é realizado ou produto real é ativado em estoque sem a autorização operacional correspondente.
