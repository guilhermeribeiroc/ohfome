# Plano de implementação: central, clientes e despacho

## Objetivo

Permitir que a equipe crie pedidos delivery pela Central de pedidos, reutilize
cadastros de clientes e escolha o entregador no despacho, sem criar contas de
acesso para clientes ou entregadores.

## Etapas

1. Adicionar a migration `035_clientes_bairro.sql` para persistir o bairro
   preferido do cliente; atualizar o schema de referência e os tipos usados no
   frontend.
2. Centralizar a autorização de clientes para `admin`, `balcao` e `delivery`.
   Criar rotas autenticadas para listar, cadastrar e editar clientes, sempre
   isoladas por estabelecimento e com telefone normalizado.
3. Estender a rota de busca já existente para retornar endereço, bairro,
   referência, e-mail e preferência de notificação necessários ao
   preenchimento do pedido.
4. Criar componentes reutilizáveis de busca/autocomplete e cadastro rápido de
   cliente. O cadastro salva e devolve o cliente escolhido para o formulário
   de pedido que o abriu.
5. Implementar a página Clientes: pesquisa, listagem, criação e edição. Expor
   a navegação e liberar a rota somente para os três papéis aprovados.
6. Atualizar o modal de novo pedido da Central para alternar entre
   balcão/retirada e delivery. No delivery, validar cliente, endereço e bairro
   e enviar o payload já suportado pela API de pedidos.
7. Adicionar o modal de seleção de entregador ao Kanban. Ao avançar um pedido
   pronto de delivery, exigir a escolha e reutilizar o endpoint de transição
   existente, que grava `em_rota`.
8. Verificar com lint, checagem de tipos e testes de integração/API disponíveis;
   revisar a migration e manter qualquer deploy fora deste escopo.

## Critérios de aceite

- A busca de clientes só encontra dados do estabelecimento da sessão.
- Um cliente escolhido preenche o pedido delivery e um novo cadastro volta
  selecionado sem perder a sacola.
- Pedido delivery não é criado sem cliente, endereço e bairro válidos.
- O botão “Saiu para entrega” da Central não altera o status até selecionar um
  entregador ativo.
- Administrador, balcão e delivery veem Clientes; cozinha não vê nem acessa a
  rota.
