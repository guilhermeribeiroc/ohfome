# Central de pedidos, clientes e despacho

## Objetivo

Permitir que quem atende pelo balcão controle todo o delivery sem sair da
Central de pedidos: criar um pedido delivery, localizar ou cadastrar o
cliente, e escolher o entregador no momento de despachar.

## Escopo aprovado

### Clientes

- Criar a aba **Clientes** no sidebar para os papéis `admin`, `balcao` e
  `delivery`.
- Listar e pesquisar somente os clientes do estabelecimento atual por nome ou
  telefone.
- Permitir cadastrar e editar nome, telefone, endereço, bairro, ponto de
  referência, e-mail e preferência de notificação.
- O cadastro de cliente não cria usuário, senha ou acesso ao painel.

### Novo pedido pela Central

- O modal da Central permitirá escolher entre **Balcão/retirada** e
  **Delivery** antes de concluir o pedido.
- Ao selecionar Delivery, a busca por nome ou telefone aparece imediatamente e
  mostra sugestões conforme as primeiras letras ou números são digitados.
- Selecionar um cliente completa contato, endereço, bairro e referência.
- Se não existir resultado adequado, a ação **Cadastrar novo cliente** abre um
  modal; ao salvar, o cliente retorna selecionado no pedido em andamento.
- Delivery exige cliente, endereço e bairro. Balcão/retirada continua sem essa
  exigência.

### Despacho na Central

- Quando um delivery pronto avançar para `saiu_para_entrega` na Central, abrir
  um modal com os entregadores ativos.
- A transição só ocorre após selecionar um entregador; o servidor registra o
  entregador, marca a entrega como `em_rota` e mantém as validações atuais.
- O cadastro de entregador é operacional e não exige uma conta de usuário.
- Administrador, balcão e delivery podem consultar clientes e despachar;
  cozinha permanece limitada ao preparo.

## Arquitetura

- Reutilizar a tabela e a rota de busca de clientes existentes, estendendo as
  rotas protegidas para listagem, criação e edição no módulo Clientes.
- Reutilizar o endpoint de criação de pedidos, que já aceita `clienteId`, e o
  endpoint de atualização de pedido, que já valida `entregadorId`.
- Extrair componentes pequenos para o seletor de cliente e o modal de
  entregador, evitando duplicar regras em Central e Delivery.
- Atualizar as permissões e a navegação com um módulo de Clientes explícito,
  sem expor dados entre estabelecimentos.

## Falhas e validação

- A API rejeita cliente de outro estabelecimento, entregador inativo e
  transição de status inválida.
- Busca vazia não retorna toda a base; a pesquisa começa com entrada útil.
- O formulário informa campos obrigatórios e mantém os itens do pedido se o
  cadastro rápido falhar ou for fechado.
- Testes cobrirão: pesquisa por nome/telefone, criação rápida sem duplicar
  telefone, preenchimento de dados, pedido delivery pela Central e despacho
  com entregador.

## Fora de escopo

- Criar login para clientes ou entregadores.
- Alterar o cardápio público.
- Atribuição automática de entregador ou roteirização.
