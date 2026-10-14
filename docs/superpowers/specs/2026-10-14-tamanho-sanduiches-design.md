# Design: tamanhos indevidos em sanduíches

**Data:** 2026-10-14  
**Status:** design aprovado em conversa; aguardando revisão escrita antes da implementação

## Problema

Produtos comuns possuem o campo legado `tamanho` com valores P, M e G. A interface acrescenta esse valor ao nome em todos os pontos do sistema. Na importação de cardápio, o leitor também pode preencher esse campo para itens comuns. Como consequência, sanduíches/hambúrgueres podem ser cadastrados e exibidos como `X-Burguer (M)` mesmo quando P/M/G não é uma variação real daquele produto.

Pães e adicionais já possuem um mecanismo próprio de opções; não devem ser representados como tamanho.

## Objetivo

Impedir que a importação classifique sanduíches, hambúrgueres e lanches como P/M/G sem evidência explícita de variação por preço, corrigir com segurança os registros indevidos já cadastrados e preservar tamanhos reais de pizzas e outros produtos.

## Abordagens avaliadas

1. **Prevenção + revisão assistida dos dados existentes (escolhida):** corrigir a regra de importação e oferecer uma lista de produtos suspeitos para remoção confirmada do tamanho. Evita apagar tamanho legítimo automaticamente.
2. Limpar P/M/G automaticamente de toda categoria com nome parecido com “sanduíches”: é rápido, mas pode apagar variação legítima, por exemplo um hambúrguer pequeno/médio/grande com preços diferentes.
3. Ocultar P/M/G apenas na interface: rejeitada, pois deixaria o dado errado em pedidos, impressão, exportações e futuras telas.

## Design

### Prevenção na importação

- O leitor continuará criando pizza configurável por tamanhos/sabores no mecanismo específico de pizza.
- Para sanduíches, hambúrgueres e lanches, `tamanho` só poderá ser retornado se a foto declarar explicitamente versões P/M/G do mesmo produto com preços diferentes e identificáveis.
- Se houver pão com preço diferente, o produto será separado por tipo de pão, com `tamanho = null`, como já previsto. Se o pão não altera valor, vira grupo de opção “Escolha seu pão”.
- A tela de revisão da importação explicará que o seletor P/M/G é apenas para variações reais de produto; em itens de sanduíche sem variação, inicia vazio.
- Validação no servidor reforçará a regra para não depender apenas da interpretação do leitor.

### Produtos existentes

- A área de produtos identificará itens com `tamanho` P/M/G cuja categoria ou nome indique sanduíche, hambúrguer ou lanche.
- A listagem mostrará produto, categoria, preço e tamanho atual, com ação explícita **Remover tamanho** por item e seleção em lote. A remoção altera somente `produtos.tamanho`; não remove produto, preço, descrição, estoque, opções de pão/adicionais ou histórico de pedidos.
- Produtos com tamanho real continuam intactos até confirmação explícita. Pizzas configuráveis ficam fora da lista de suspeitos.
- Itens já presentes em pedidos mantêm o snapshot histórico de tamanho, para preservar comandas, relatórios e comprovantes já registrados. A correção vale para novas vendas/exibição de produto.

### Exibição

- `nomeProdutoComTamanho` continua mostrando P/M/G quando o dado realmente existe; não haverá regra visual que esconda valores e deixe o banco inconsistente.
- Após remover o tamanho de um produto, Central, Delivery, cardápio público, estoque e novo pedido passam a mostrar somente o nome.

## Critérios de aceite

1. Importar cardápio com sanduíches sem variação real não grava P/M/G nesses produtos.
2. Pão com preços distintos vira itens separados por pão e sem P/M/G; pão sem diferença de preço vira opção do produto.
3. Uma tela de revisão permite remover tamanho de sanduíches suspeitos individualmente ou em lote, sem excluir produto ou alterar preço/estoque/opções.
4. Pizzas configuráveis e itens que mantêm tamanho real não são alterados sem escolha explícita.
5. Pedidos anteriores preservam o snapshot de tamanho; novos pedidos refletem a correção.
6. Validações de tenant e permissões impedem revisão de produtos de outro restaurante.

## Fora do escopo

- Converter automaticamente todos os produtos P/M/G existentes.
- Alterar o modelo de pizza configurável.
- Renomear categorias ou produtos sem ação explícita do administrador.

## Revisão da especificação

- [x] A correção não destrói produtos, preço, estoque, opções ou histórico.
- [x] A prevenção é aplicada tanto no leitor quanto no servidor.
- [x] A regra diferencia tamanho real de produto, tipo de pão e pizza configurável.
