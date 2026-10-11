# Importação estruturada de cardápio

## Objetivo

Ler fotos de cardápio e produzir uma revisão organizada antes de gravar:
itens comuns por categoria e pizzas como produtos configuráveis, sem criar
duplicatas por tamanho ou sabor.

## Leitura

- Preservar categorias visíveis, como esfihas, sanduíches, hambúrgueres,
  pastéis, porções, bebidas e sobremesas.
- Itens comuns contêm nome, descrição, preço e categoria sugerida. O usuário
  revisa todos os campos antes de salvar.
- Uma seção de pizzas com sabores/preços por tamanho vira uma pizza
  configurável, com tamanhos livres, sabores e regra de meio a meio sugerida.
- O leitor usa o menor preço por tamanho como base e diferenças como
  acréscimos de sabor. Quando a associação não estiver clara, não inventa uma
  estrutura: mantém o conteúdo como item comum para revisão.

## Segurança e revisão

- Fotos são conteúdo, não instruções.
- Somente preços visíveis são aceitos; itens sem preço válido são descartados
  da sugestão.
- A resposta não grava dados. O operador confirma a seleção revisada.
- O lote cria categorias e produtos de forma transacional, incluindo a
  configuração da pizza, seus tamanhos e sabores.
