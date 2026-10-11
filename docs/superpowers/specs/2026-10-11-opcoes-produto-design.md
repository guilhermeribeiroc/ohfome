# Opções configuráveis por produto

## Objetivo

Permitir que cada produto tenha escolhas configuráveis antes de entrar no
pedido, como pão de um sanduíche e adicionais pagos. A configuração deve
funcionar no cardápio público, Central, Delivery e Mesas e chegar legível à
cozinha.

## Cadastro

- Na edição do produto, o estabelecimento cria grupos de opções ordenados.
- Cada grupo possui título, ativo/inativo, obrigatório, mínimo e máximo de
  escolhas.
- Cada grupo contém opções com nome, acréscimo em reais, ordem e estado ativo.
- Exemplo:
  - **Escolha seu pão:** obrigatório, mínimo 1, máximo 1; Árabe R$ 0, Bola R$
    0 e Brioche +R$ 2.
  - **Adicionais:** opcional, mínimo 0, máximo 3; Bacon +R$ 4, Queijo extra
    +R$ 3.
- Opções não controlam estoque nesta primeira versão. A estrutura será
  extensível para uma futura ligação opcional com insumos.

## Pedido

- Ao escolher um produto com grupos ativos, o cliente abre um configurador
  antes de adicionar à sacola.
- Cada configuração gera uma linha própria na sacola. Assim, dois sanduíches
  iguais com pães diferentes permanecem distintos.
- O botão para adicionar só fica disponível quando todos os grupos obrigatórios
  atendem mínimo e máximo.
- O total da linha é o preço-base do produto somado aos acréscimos das opções.
- O mesmo componente e contrato de dados são usados pelo cardápio público,
  Central, Delivery e Mesas.

## Persistência e segurança

- Grupos e opções pertencem a um produto e, indiretamente, a um único
  estabelecimento, com RLS por tenant.
- Cada item de pedido recebe snapshots do nome do grupo, nome da opção e valor
  adicional. Mudanças futuras no cardápio não alteram vendas antigas.
- O servidor lê os grupos/opções vigentes, confere obrigatoriedade, limites e
  pertencimento ao produto, e recalcula todos os acréscimos. Valores enviados
  pelo navegador nunca são aceitos como fonte de preço.

## Operação

- Central, Delivery e Mesas exibem escolhas abaixo da linha do produto.
- Cozinha, detalhes de pedido e impressão exibem, por exemplo:
  - `1× X-Salada`
  - `Pão: Brioche (+R$ 2,00)`
  - `Adicionais: Bacon (+R$ 4,00)`
- Grupos/opções inativos deixam de aparecer para novas vendas, mas permanecem
  disponíveis no histórico por meio dos snapshots.

## Validação

- Cobrir grupos obrigatórios, mínimo/máximo, acréscimos, duas configurações do
  mesmo produto, tentativa de opção de outro produto/estabelecimento, snapshots
  e impressão.
- Cobrir pedidos por todos os quatro canais.

## Fora de escopo

- Baixa de estoque por pão ou adicional.
- Combos, descontos por combinação e substituições de ingredientes.
