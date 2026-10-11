# Melhorias de operação da pizzaria — OhFome

Data: 2026-10-10
Base examinada: `master`, commit `b2372d8`.
Estado: desenho apresentado na conversa; usuário autorizou continuar a documentação. A especificação escrita está sujeita à revisão do usuário antes do plano técnico detalhado.

## 1. Objetivo e decisões confirmadas

Adaptar o atendimento de uma pizzaria sem criar um segundo sistema de vendas. Aproveitar pedidos, clientes, entregadores, financeiro, cardápio e estação de impressão existentes.

O usuário confirmou duas modalidades de balcão: venda imediata de produtos já entregues e pedido que ainda precisa de preparo. Também confirmou a recomendação de estoque compartilhado: balcão, mesas, retirada e delivery consomem a mesma disponibilidade do produto.

O trabalho contempla seis melhorias e a validação de um recurso já existente:

| Frente | Resultado esperado |
| --- | --- |
| Balcão | Venda imediata, pedido para retirada ou delivery a partir do atendimento |
| Clientes | Busca por nome ou telefone e preenchimento de dados existentes |
| Entregadores | Cadastro nominal e seleção obrigatória ao despachar delivery |
| Produtos por unidade | Reposição, ajuste, disponibilidade pública e bloqueio de esgotados |
| Cardápio por foto | Importação assistida, revisável e resistente a falhas |
| Cozinha | Ticket com fonte maior e observações legíveis |
| Bairros | Validar cadastro próprio de bairro e taxa, que já existem |

Uma única especificação define as regras comuns; as entregas serão incrementais. Não há autorização implícita para implantar em produção, executar cobranças, estornar pagamentos ou alterar os dados reais da cliente durante o planejamento.

## 2. Contexto verificado no código

- `web/src/components/pedidos/KanbanBoard.tsx`: o formulário atual cria pedido presencial ou de mesa, sem busca de cliente e sem venda imediata. Botão e arraste usam a mesma ação de avanço.
- `web/src/app/api/pedidos/route.ts`: a criação interna sempre inicia em `novo` e envia à cozinha. Delivery interno cria cliente novo com telefone artificial e não persiste o endereço no cadastro de clientes.
- `web/src/components/delivery/DeliveryModule.tsx`: já há cadastro de entregador por nome. Atribuição e saída são ações separadas; é possível despachar sem responsável.
- APIs de pedidos e entregas mantêm regras de transição separadas. Elas precisam compartilhar as regras das operações alteradas por esta especificação.
- `database/schema.sql`: clientes têm telefone único por estabelecimento e endereço. O pedido público reaproveita clientes por telefone. O estoque existente é de insumos, baixado por ficha técnica na inserção de itens; não existe saldo próprio do produto acabado exposto no cardápio.
- `web/src/components/cardapio-publico/CardapioPublico.tsx`: o catálogo é carregado inicialmente, sem atualização periódica do saldo dos produtos.
- Importação existente: `web/src/lib/importar-cardapio.ts`, API de extração, API de cadastro em lote e modal de revisão em `PrecificacaoCalculadora.tsx`. Aceita até seis fotos JPG/PNG/WebP, com limite de 8 MB por foto; depende de configuração Anthropic.
- Impressão existente: ESC/POS no `ImpressaoQzTray.tsx` e HTML em `web/src/lib/impressao.ts`. A rotina térmica atual corta palavras maiores que a largura da linha, problema que deve ser corrigido no trabalho de legibilidade.
- O financeiro soma pedidos finalizados. Criar também uma entrada financeira avulsa para a mesma venda duplicaria o total.
- Administrador já pode criar, alterar taxa e ativar/desativar bairro em `Delivery → Taxas por bairro → Adicionar outro bairro`. Bairros ativos são disponibilizados no checkout público; a taxa é recalculada pelo servidor.

Essas constatações são de leitura do repositório, não de testes novos no site publicado ou na impressora da cliente.

## 3. Abordagem escolhida e limites

### Recomendada: evolução integrada

Manter os módulos atuais e concentrar as regras de estoque, criação e expedição no servidor e no banco. As telas apenas apresentam as opções autorizadas. Preços, disponibilidade e pertencimento ao estabelecimento nunca dependem de valores fornecidos pelo navegador.

### Alternativa considerada: PDV de balcão separado

Uma tela e um domínio de vendas independentes permitiriam maior especialização futura, mas exigiriam sincronização de clientes, estoque, financeiro e impressão. Não serão criados neste escopo.

Não entram: roteirização/GPS, aplicativo de entregador, estoque exclusivo de delivery, previsão de compras, redefinição automática do saldo diário, geração de fotografias dos pratos, extração de fotos individuais do cardápio, novos tamanhos além dos suportados e reforma completa do financeiro.

## 4. Atendimento no balcão

Um formulário de atendimento compartilhado apresenta três destinos claros:

| Destino | Estado inicial | Cozinha | Encerramento |
| --- | --- | --- | --- |
| Venda imediata | Finalizado, após confirmação do recebimento | Não imprime ticket automático de preparo | Já concluída |
| Pedido para retirada | Novo | Envia para preparo | Pronto → finalizado na retirada |
| Pedido delivery | Novo | Envia para preparo | Pronto → saiu para entrega → finalizado |

Venda imediata exige confirmação explícita do atendente de que os produtos foram entregues e o pagamento recebido. Informar Pix ou cartão não equivale a confirmar uma transação externa. Cliente é opcional nessa modalidade. Pedido para preparo não se torna pago apenas por ter uma forma de pagamento selecionada.

Reutilizar dinheiro, cartão, Pix e pagamento dividido já modelados pelo sistema, com validação uniforme de valores e troco. A taxa de entrega aplica-se somente ao delivery e vem do bairro ativo selecionado.

Criar pedido, itens, vínculo de cliente, efeitos de estoque e destino de impressão na mesma transação. Falha de um item desfaz a operação inteira. A nova venda imediata é uma criação específica autorizada pelo servidor, não uma permissão para pular estados de qualquer pedido existente.

O fluxo de retirada não passa por `saiu_para_entrega`. Manter o atendimento de mesa existente e suas permissões; o formulário não pode oferecer lançamento de mesa para um papel sem autorização.

Cada tentativa de criação recebe uma chave de idempotência do atendimento. Reenvio após perda de conexão retorna o pedido já criado; uso da mesma chave com conteúdo diferente é rejeitado. A resposta mostra número e resultado mesmo quando uma venda finalizada não aparece no Kanban de pedidos ativos. O financeiro continua contando a venda a partir do pedido finalizado, sem entrada avulsa duplicada.

## 5. Busca e reutilização de clientes

A busca interna é autenticada, restrita ao estabelecimento e disponível aos papéis de atendimento autorizados. Retorna somente identificação e contato necessários ao pedido, em lista limitada. Não reutilizar a integração externa de clientes administrativos, que tem finalidade diferente.

Buscar por nome ou telefone com normalização, debounce e cancelamento de respostas antigas. Nomes iguais não são fundidos: a lista mostra telefone e indicação de endereço para seleção explícita. Telefone artificial de cadastros antigos não é apresentado como contato real.

Selecionar um cliente preenche os dados disponíveis. O atendente confirma endereço e bairro para delivery; bairro desativado ou ausente exige nova escolha. Endereço de texto livre antigo não será convertido silenciosamente em bairro cadastrado.

Para cliente novo, salvar cadastro reutilizável quando houver telefone válido, sem gerar duplicatas por repetição de atendimento. No cadastro interno, telefone passa a ser opcional: quando ausente, persistir `null`, não um telefone fictício. Um delivery continua vinculado a um cliente identificado por ID, preservando a constraint existente; sem telefone, o reuso exige seleção explícita e nunca fusão automática por nome. O checkout público mantém a exigência de telefone válido. Retirada e venda imediata não exigem endereço.

Aplicar a mesma normalização de telefone nas criações internas e públicas. Antes de adicionar unicidade do contato normalizado, detectar colisões de cadastros antigos; não fundir pessoas ou apagar registros automaticamente. Telefone ausente não participa da chave de deduplicação. Pedidos e cadastros preexistentes não serão reescritos para simular dados históricos.

Editar endereço para uma entrega não altera automaticamente o cadastro: haverá opção explícita de atualizar os dados do cliente. Pedidos novos preservam nome, contato autorizado e endereço usados naquele atendimento, para uma edição posterior não reescrever o histórico. Dados pessoais continuam ocultos dos papéis sem necessidade operacional.

## 6. Entregadores e expedição

Reaproveitar o cadastro nominal existente. Administrador e equipe de delivery autorizada podem gerir entregadores; balcão pode consultar e selecionar responsáveis para despachar, sem receber automaticamente permissão para gerir a equipe.

Ao clicar em saída ou arrastar um delivery para essa etapa, abrir seleção de entregador antes de escrever. A mesma exigência deve valer na API, incluindo tentativas diretas sem passar pela tela. Não se pode atribuir entregador de outro estabelecimento, inativo, nem despachar pedido cancelado, finalizado ou ainda não pronto.

Uma operação transacional atualiza pedido, entrega, entregador e auditoria. A simples escolha no formulário não dispara a saída antes da confirmação. Exibir o responsável no cartão, detalhes e via de entrega.

Um entregador pode levar vários pedidos. Mostrar carga ativa e derivar disponibilidade das entregas em andamento: concluir ou cancelar uma entrega não o torna livre se ainda houver outra. Desativação preserva o nome e os vínculos históricos; não excluir quem tem entregas ativas. Este escopo não exige login individual do entregador.

## 7. Estoque compartilhado por unidade

### 7.1 Operação diária

Controle opcional para produtos acabados ou de revenda, inicialmente útil para bebidas. Produtos existentes permanecem sem controle de unidades até ativação e contagem inicial; não se presume que todos começaram com saldo zero.

Oferecer duas ações com significado diferente:

- **Adicionar unidades:** registrar mercadoria recebida, somando ao saldo físico.
- **Ajustar contagem:** informar quantas unidades existem fisicamente, incluindo as já separadas para pedidos ainda não concluídos. Mostrar unidades comprometidas e a nova disponibilidade antes de confirmar.

A disponibilidade vendável é `saldo físico − unidades comprometidas`. Ajuste físico menor que a quantidade comprometida é rejeitado, com orientação para resolver os pedidos envolvidos. Não zerar nem repor automaticamente na virada do dia. Registrar entradas, ajustes, compromissos, consumo e liberação com data, operador, motivo e pedido quando aplicável.

O saldo é compartilhado entre todos os canais. Variações já cadastradas como produtos separados têm saldos próprios. A importação de um cardápio não inventa quantidades de estoque.

Administrador e estoque autorizado podem ativar controle, repor e ajustar; atendimento apenas consulta e realiza o consumo pela venda. Desativar controle com compromissos em aberto é rejeitado. Deixar um produto fora do cardápio não elimina compromissos de pedidos já aceitos.

### 7.2 Consistência e concorrência

Manter saldo por produto e estabelecimento e registros de compromissos por item de pedido, com constraints de inteiros não negativos e vínculos compostos por estabelecimento. Centralizar a operação no banco para cobrir APIs internas e funções públicas `SECURITY DEFINER`.

Conferir produtos em ordem estável, bloquear os saldos e comprometer as quantidades na mesma transação que aceita o pedido. Quantidades repetidas do mesmo produto contam de forma agregada. O estoque é comprometido no envio do pedido, não ao adicionar ao carrinho.

Venda imediata consome as unidades na criação. Pedido em preparo/entrega compromete unidades na aceitação e converte esse compromisso em consumo no encerramento, sem uma segunda redução da disponibilidade. Nenhum saldo pode ficar negativo. Falha desfaz todo o pedido e seus efeitos.

Cancelamento antes de começar o preparo libera as unidades uma única vez. Depois de iniciado o preparo/expedição, não devolver automaticamente: registrar consumo/perda e exigir uma entrada manual auditada se o produto de fato voltou em condição de venda. Impedir liberação ou consumo duplicado em retries, cliques repetidos e webhooks.

Rejeitar exclusão definitiva de pedido que tenha compromissos ou movimentações do novo estoque unitário; usar cancelamento e preservar auditoria. Os caminhos existentes de fechamento de mesa/comanda e finalização em lote também devem consumir os compromissos exatamente uma vez.

A baixa de insumos existente não será confundida com o novo saldo de produtos. No primeiro escopo, controle unitário de produto acabado e ficha técnica com baixa de insumos são modos exclusivos para o mesmo produto: ativar um exige resolver o outro explicitamente. Isso evita descontar duas vezes uma latinha representada nas duas estruturas.

Vendas retroativas permanecem registros históricos e não consomem novamente o saldo unitário atual. Distinguir esse caminho da venda imediata feita hoje e validar que não permite contornar o controle de uma venda operacional nova.

### 7.3 Pagamento pendente e falhas

Pedidos aceitos com dinheiro, cartão ou Pix manual comprometem estoque mesmo que o pagamento ainda não esteja confirmado. Somente cobranças Pix automáticas que aguardam o provedor usam reserva temporária vinculada à expiração da cobrança.

Falha ao criar a cobrança libera a reserva e encerra o pedido não enviado à cozinha. Aprovação converte a reserva temporária em compromisso do pedido, preservando a disponibilidade, e libera o preparo uma única vez. Rejeição ou expiração confirmadas cancelam o pedido não iniciado e liberam as unidades.

A reconciliação de reservas precisa funcionar sem uma aba do cliente aberta: tarefa operacional de servidor, limitada e observável, mais reconciliação nas operações pertinentes. Não liberar apenas pelo relógio local quando o estado do provedor for desconhecido; manter a reserva, sinalizar pendência e repetir a verificação. Uma confirmação tardia depois da liberação exige revisão operacional e não envia automaticamente um pedido sem estoque à cozinha. Não efetuar estorno financeiro automático neste escopo.

### 7.4 Cardápio e carrinho

Expor somente disponibilidade vendável, não histórico ou custos. Produto controlado mostra, por exemplo, `18 disponíveis`. Com saldo zero, permanecer visível como `Esgotado`, bloqueando adicionar, aumentar quantidade e enviar o pedido com esse item.

Atualizar disponibilidade com consulta leve a cada 10 segundos enquanto a página estiver visível e ao voltar ao foco, abrir checkout ou receber conflito. A consulta de saldo não usa cache compartilhado e não retransmite todo o catálogo. O dado exibido pode mudar entre consulta e compra: a decisão final é sempre do banco. Se outro atendimento consumiu o saldo, informar o item e a quantidade atual sem criar parte do pedido. Falha de atualização não habilita compra sem a validação final.

Aplicar a regra também a detalhes do produto, adicionais de pedido, formulário de delivery interno e atendimento de mesas/balcão. Não reduzir silenciosamente o carrinho ou cobrar algo diferente; pedir ajuste ao cliente.

## 8. Importação do cardápio por imagem

A funcionalidade já existe e será revisada, não reconstruída. Verificar a configuração de credencial e modelo do provedor sem expor segredos. Ausência de configuração, indisponibilidade, timeout, imagem inválida, foto ilegível e extração incompleta devem produzir mensagens recuperáveis e sair do estado de carregamento.

Manter limites de seis fotos e 8 MB por imagem, validar conteúdo real e limitar os arquivos da requisição a 48 MB somados, além de um limite explícito para o envelope multipart. Tratar o texto das imagens como conteúdo do cardápio, nunca como instruções para alterar o sistema ou executar ações.

A revisão permite corrigir nome, descrição, categoria, tamanho e preço; incluir/remover itens; e identificar possíveis duplicidades contra produtos já existentes e dentro do lote. As opções são manter o existente, atualizar explicitamente ou criar outro produto. Não sobrescrever por similaridade de nome.

Usar somente os tamanhos P/M/G já suportados. Uma descrição ambígua como broto/grande exige conferência do mapeamento na revisão; não apresentar como leitura certa. Foto do cardápio não vira automaticamente foto de cada produto.

Salvar o lote confirmado em transação e proteger reenvio contra duplicidade. Limite atual de 100 itens por lote deve ser claro; extração acima dele exige seleção/divisão explícita, sem descartar produtos silenciosamente. Produtos importados mantêm controle de unidades desativado até contagem feita pelo responsável.

## 9. Impressão legível para a cozinha

Criar perfil de cozinha `Grande` como padrão para a nova formatação, preservando a configuração de papel e permitindo retorno ao perfil normal. Número do pedido, modalidade, quantidade e nome dos itens têm maior destaque; observações têm fonte legível e negrito, com separação visual dos itens. Informações secundárias não podem tornar o produto difícil de ler.

Alvo inicial do perfil: itens e observações térmicos com altura dupla e largura normal; referência do pedido com altura/largura duplas e quebra apropriada. Na via HTML de cozinha, itens com 18 px, observações com 16 px e referência com 24 px, em preto. Esses valores são ponto inicial de homologação, ajustáveis conforme o teste físico, sem diminuir o perfil para o tamanho antigo silenciosamente.

Aplicar perfil tanto ao ticket automático/reimpressão QZ quanto à via HTML destinada à cozinha. Preservar o formato de recibos financeiros e do entregador quando não forem selecionados como via da cozinha.

Separar formatação térmica em unidade testável, sem mudar reserva da fila, autenticação QZ, liderança de abas ou política de retries. Calcular a largura efetiva conforme ampliação da fonte em 58/80 mm. Quebrar palavras longas em todas as partes, sem truncar nomes ou observações. Restaurar tamanho, alinhamento e negrito ao terminar cada bloco/ticket.

Incluir teste com pizza de nome longo, vários tamanhos, quantidade maior que nove, adicionais e observações extensas. A aprovação de comandos e snapshots não comprova legibilidade física. Validar na impressora instalada; modelo Tanca ainda não foi informado, portanto não prometer compatibilidade perfeita ou driver específico.

## 10. Bairros e taxas de entrega

Recurso já existente: administrador informa nome próprio e taxa; não depende de catálogo externo de bairros. Manter isolamento por estabelecimento, valor monetário válido, prevenção de duplicidade e ativação/desativação.

Na implementação dos novos formulários, permitir leitura de bairros ativos pelo balcão/delivery autorizado sem conceder edição administrativa. Confirmar atualização da lista após cadastro e taxa vigente no servidor ao lançar o pedido. Se o valor mudar desde a revisão do checkout, avisar e pedir confirmação do novo total em vez de aceitar pagamento calculado com taxa antiga.

Persistir endereço, nome do bairro e taxa no pedido/entrega como informação daquela venda. Alterar a taxa do bairro depois não modifica pedidos existentes. Corrigir feedback das operações de edição/desativação se falharem; não mostrar mudança salva quando a API rejeitou.

## 11. Arquitetura e separação de responsabilidades

| Unidade | Responsabilidade e interface |
| --- | --- |
| Atendimento compartilhado | Montar pedido e apresentar resultado; depende de catálogo, busca de clientes, bairros e API de pedidos |
| Busca de clientes | Consulta limitada, tenant e papel; retorna dados de atendimento, sem acesso ao serviço de integração externa |
| Criação de pedido | Validar modalidade/pagamento, resolver idempotência e executar transação com preço do banco |
| Controle de unidades | Ativar controle, movimentar saldo, comprometer, consumir e liberar de forma idempotente |
| Expedição | Validar transição e entregador, atualizar pedido/entrega e carga ativa atomicamente |
| Importação assistida | Extrair dados sem gravar, revisar conflitos e cadastrar lote confirmado |
| Formatação de cozinha | Produzir ticket legível; não decide consumo de jobs nem pagamentos |
| Disponibilidade pública | Expor saldo vendável e atender atualização leve do cardápio |

Extrair apenas responsabilidades diretamente tocadas pelo trabalho dos componentes grandes atuais. Não refatorar módulos inteiros ou trocar a stack. Preservar autenticação revalidada, RLS, preço do servidor, proteção de upload, constraints existentes e fila de impressão.

Migration incremental posterior à 032, com atualização do schema consolidado. Criar constraints e grants específicos para as novas estruturas. Inicializar sem estoque controlado para produtos antigos; não reprocessar pedidos históricos nem inferir quantidades das vendas anteriores. Antes de ativar, conferir estoque físico e pedidos ativos; se houver pedidos antigos do produto em andamento, exigir sua conclusão ou reconciliação explícita antes da ativação.

## 12. Critérios de aceitação e testes

1. Venda imediata gera um pedido finalizado, confirma recebimento, entra uma vez no financeiro e não produz job de cozinha. Reenvio da requisição não duplica venda/estoque.
2. Retirada entra no preparo e finaliza na entrega ao cliente, sem exigir entregador. Delivery exige bairro/endereço e responsável na saída.
3. Busca identifica cliente por nome/telefone; homônimos permanecem distintos. Reuso não cria duplicata e mudança de cadastro não reescreve pedidos novos já lançados.
4. Cadastro nominal, seleção, arraste e chamada direta da API respeitam as mesmas regras. Entregador de outro tenant é rejeitado. Dois pedidos com o mesmo entregador mantêm sua ocupação até ambos terminarem.
5. Entrada de 20 unidades, venda de duas e disponibilidade 18 são coerentes em balcão, mesa e cardápio. Ao vender as 18 restantes, produto permanece visível como esgotado.
6. Duas compras simultâneas, uma de balcão e outra pública, disputam a última unidade: só uma é aceita, sem pedido parcial ou saldo negativo. Testar também múltiplos produtos e itens repetidos.
7. Reposição reativa a compra. Contagem física respeita compromissos existentes e registra operador/motivo. Saldo não muda por virar o dia.
8. Cancelamento antes do preparo libera uma vez; depois do preparo não devolve silenciosamente. Finalização consome sem descontar novamente a disponibilidade.
9. Pix automático aprovado, rejeitado, expirado, webhook duplicado/fora de ordem, criação de cobrança com falha e provedor temporariamente indisponível não duplicam consumo nem liberam estoque indevidamente. Reconciliação funciona sem navegador aberto.
10. Adicionais respeitam estoque. Venda histórica não desconta novamente o saldo unitário do presente. Produto sem controle continua operando como antes.
11. Foto real legível extrai dados revisáveis; erro de rede/configuração não prende a tela. Reimportação sinaliza duplicidades. Nenhuma gravação ocorre antes da confirmação.
12. Bairro novo com taxa aparece na seleção; total usa a taxa correta. Alteração posterior não muda pedido anterior. Usuário de atendimento não ganha permissão de editar taxas.
13. Ticket de cozinha 58/80 mm preserva integralmente produto/observação e tem destaque maior. Testes de formatação e teste físico são verificações separadas.
14. Regressão de isolamento entre tenants, papéis, mesa/comanda, pagamento dividido, preço do banco, login, fila automática e reimpressão.

Executar testes unitários das regras/formatadores, integração com PostgreSQL e cenários de concorrência, testes de API por papel e navegação ponta a ponta com dados sintéticos. Lint, TypeScript e build complementam os testes; não comprovam regras de negócio sozinhos. Usar provedor simulado para pagamento/IA na rotina automatizada e teste controlado autorizado para verificar a integração externa.

## 13. Sequência de entrega e revisão

1. Fundamentos: testes, migration, controle de unidades e operações de pedido idempotentes.
2. Atendimento: venda imediata/preparo/delivery, clientes e leitura autorizada de bairros.
3. Expedição: responsável obrigatório e consistência de pedido/entrega.
4. Cardápio: disponibilidade, esgotado, checkout/adicionais e reconciliação de reservas.
5. Importação: configuração, falhas, revisão e duplicidades.
6. Impressão: perfil maior, testes de formatação e validação física.
7. Regressão completa e preparação do deploy: backup, migration antes do código dependente e verificações pós-deploy autorizadas.

As fases com estoque não devem ser ativadas parcialmente em produção enquanto outro caminho ainda puder vender sem o controle. Mudanças aditivas permitem retorno ao código anterior somente com controle novo ainda desativado; depois da ativação, reversão exige conciliar reservas e disponibilidade antes de liberar vendas por uma versão antiga.

O próximo passo é a revisão desta especificação pelo usuário. Após confirmação, produzir o plano técnico com tarefas, arquivos, testes, dependências e condições de entrega. O documento não declara implementação, testes de aplicação ou deploy concluídos.
