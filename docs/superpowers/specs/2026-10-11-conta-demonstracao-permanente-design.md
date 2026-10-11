# Conta de demonstração permanente

## Objetivo

Transformar a conta já publicada `restauranteteste`, cujo acesso administrativo
é `teste123`, em uma demonstração permanente e isolada da **Pizzaria Bom
Sabor**. Ela deve permitir apresentar, em produção, o cardápio público, a
operação interna e a integração de Pix do Mercado Pago sem usar dados ou saldo
de restaurantes reais.

## Escopo aprovado

- Preservar a conta, o acesso administrativo e o slug existentes.
- Manter um catálogo permanente e amplo, com aproximadamente 30 produtos em
  pizzas salgadas, pizzas doces, combos, porções, bebidas e sobremesas.
- Cadastrar dados fictícios, porém coerentes, de clientes, equipe, mesas,
  entregadores, bairros, taxas de entrega, estoque e movimentações financeiras.
- Criar pedidos de exemplo em etapas distintas: novo, em preparo, saiu para
  entrega, finalizado, retirada e balcão.
- Permitir que novos pedidos criados durante demonstrações permaneçam nessa
  conta sem modificar o catálogo ou apagar dados-base.
- Disponibilizar no cardápio público Pix automático do Mercado Pago em ambiente
  de testes. O QR Code será emitido pela API do Mercado Pago, mas não poderá
  receber dinheiro real nem afetar saldo de clientes ou restaurantes.

## Isolamento e Mercado Pago

O estabelecimento de demonstração terá uma conexão Mercado Pago marcada como
`teste`. A aplicação aceitará essa modalidade somente para o estabelecimento
identificado pelo slug `restauranteteste`; todas as demais contas continuarão
com o fluxo OAuth de produção já utilizado pelo produto.

O access token de teste será cifrado no servidor usando a infraestrutura de
cifragem existente. Ele não será retornado por APIs, enviado ao navegador,
incluído em logs, migrations, arquivos seed ou commits. A credencial será
fornecida somente no provisionamento por um canal seguro.

Para uma cobrança de teste, a aplicação cria a ordem no Mercado Pago usando o
token de teste, exibe o QR Code e acompanha os status retornados pelo provedor.
O pedido permanece pendente até a confirmação simulada. A interface do painel
identifica a conta como ambiente de demonstração para evitar confusão durante
apresentações, sem alterar a aparência do cardápio voltada ao consumidor.

## Conteúdo inicial

### Catálogo e estoque

Os cerca de 30 itens terão nome, descrição, categoria, imagem, custo e preço
de venda. Bebidas e sobremesas usarão estoque por unidade com quantidades
iniciais suficientes para demonstrar disponibilidade, baixa e esgotamento.
Pizzas e demais itens preparados sob demanda não terão uma quantidade finita
que possa interromper uma apresentação.

### Operação

A equipe fictícia terá administrador, balcão, cozinha, estoque, caixa e
entregadores nomeados. Clientes de teste terão nomes, telefones, endereços e
referências fictícias. Bairros terão taxas distintas e as mesas permitirão
demonstrar atendimento no salão. Pedidos e lançamentos financeiros de exemplo
usarão valores compatíveis com o catálogo e identificarão a origem de
demonstração.

## Carga repetível

Uma carga transacional específica para a conta será responsável pelos dados
base. Ela será idempotente e atualizará somente entidades marcadas como
demonstração: catálogo, pessoas fictícias, configuração operacional, estoque e
pedidos de exemplo. Pedidos criados posteriormente em apresentações não serão
apagados.

Antes de mudar dados, a carga verificará a existência da conta e as migrations
necessárias. Qualquer divergência inesperada interrompe a transação inteira,
evitando um cardápio ou configuração parcialmente atualizados.

## Validação e critérios de aceite

Após o provisionamento, validar:

1. O login `teste123` abre a Pizzaria Bom Sabor e indica que é demonstração.
2. O cardápio público mostra produtos agrupados, imagens, preços e estoque
   disponível sem expor nenhuma credencial.
3. Busca de cliente, venda no balcão, retirada, delivery com taxa por bairro e
   seleção de entregador funcionam com os dados carregados.
4. A baixa e a reposição de estoque por unidade refletem no cardápio público.
5. Um pedido Pix gera QR Code pelo Mercado Pago em ambiente de teste, sem
   movimentar dinheiro real.
6. Uma conta que não seja `restauranteteste` não consegue usar a conexão de
   teste do Mercado Pago.

## Fora de escopo

- Mudar a senha do administrador ou armazená-la no repositório.
- Configurar credenciais de produção do Mercado Pago para a demonstração.
- Importar ou usar dados reais de clientes, pedidos ou restaurantes.
- Excluir pedidos criados manualmente durante apresentações.
