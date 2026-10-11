# Pizzas configuráveis — OhFome

## Objetivo

Permitir que uma pizzaria cadastre uma pizza uma única vez e configure os
tamanhos, sabores e adicionais oferecidos. No pedido, o cliente escolhe um
sabor inteiro ou dois sabores em metades, sem duplicar produtos como
"Calabresa P", "Calabresa M" e "Calabresa G".

## Cadastro

- Um produto pode ser marcado como **pizza configurável**.
- O estabelecimento cria livremente os tamanhos que comercializa. Não há
  tamanhos obrigatórios nem limite aos rótulos P/M/G: exemplos incluem Broto,
  Média, Grande e Família.
- Cada tamanho possui nome, preço de pizza de sabor único, posição e estado
  ativo.
- O estabelecimento cadastra os sabores disponíveis para a pizza, com nome,
  descrição opcional, preço adicional por tamanho quando aplicável, posição e
  estado ativo.
- Os adicionais existentes por produto continuam disponíveis e são escolhidos
  após tamanho e sabor(es).

## Pedido

- Todo tamanho ativo aceita uma pizza de sabor único ou meio a meio; não há
  configuração para bloquear a modalidade meio a meio.
- Para sabor único, o servidor usa o preço do tamanho com o ajuste do sabor,
  quando houver.
- Para meio a meio, o estabelecimento escolhe uma regra de preço por pizza:
  1. valor do sabor mais caro;
  2. média dos dois sabores;
  3. preço fixo definido para cada tamanho.
- A seleção exige dois sabores distintos. O configurador deixa clara a ordem
  visual `½ sabor A / ½ sabor B`, mas a ordem não altera o preço.
- A mesma experiência é reutilizada pelo cardápio público, Central de
  Pedidos, Delivery e Mesas. Cada configuração vira uma linha própria da
  sacola, permitindo duas pizzas do mesmo produto com sabores diferentes.

## Persistência e segurança

- Tamanhos e sabores pertencem ao produto e ao estabelecimento, com RLS e
  vínculos que impedem uso entre estabelecimentos.
- Cada item de pedido guarda snapshots de: tamanho, sabores, modalidade
  inteira/meio a meio, regra de preço aplicada, preço dos sabores e adicionais.
  Alterar o cardápio depois não muda pedidos históricos.
- O navegador envia somente identificadores. O servidor busca tamanho e
  sabores ativos do mesmo produto, impede repetição, recalcula integralmente o
  preço e rejeita dados incompatíveis.
- Produtos normais e os grupos de opções já existentes permanecem compatíveis.

## Operação e impressão

- Cozinha, detalhes do pedido e impressão mostram tamanho, sabores e
  adicionais de forma explícita. Exemplo:
  - `1× Pizza Grande`
  - `½ Calabresa / ½ Frango com Catupiry`
  - `Adicionais: borda recheada`
- Sabores ou tamanhos inativados deixam de aparecer apenas em novos pedidos;
  os snapshots preservam o histórico.

## Fora de escopo

- Quatro sabores ou frações diferentes de meio a meio.
- Estoque separado por sabor, massa ou borda.
- Combos de pizza e descontos automáticos por combinação.

## Critérios de aceitação

1. Uma pizzaria sem tamanho P cadastra apenas os tamanhos que vende e o
   cliente só enxerga esses tamanhos.
2. Pizza de sabor único e meia a meia são aceitas em todos os quatro canais.
3. Cada uma das três regras de preço retorna o total correto, calculado no
   servidor.
4. Dois sabores iguais, inativos, de outra pizza ou de outro estabelecimento
   são rejeitados.
5. Item, cozinha e impressão preservam tamanho, sabores e adicionais mesmo
   depois de alterações no cardápio.
