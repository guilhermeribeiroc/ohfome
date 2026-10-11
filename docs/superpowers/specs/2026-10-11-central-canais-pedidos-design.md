# Canais visíveis na Central de pedidos

## Objetivo

Permitir que o atendente reconheça imediatamente se cada pedido da Central é
Delivery, Mesa, Retirada ou Balcão, sem abrir o card, e possa isolar um canal
durante períodos de pico.

## Escopo aprovado

- Cada card da Central exibirá, ao lado do código, uma etiqueta de canal com
  ícone, cor e texto em caixa alta.
- A etiqueta de Mesa incluirá o número da mesa, como **MESA 07**.
- A Central terá filtros rápidos: Todos, Delivery, Mesa, Retirada e Balcão.
- O filtro é apenas local à tela, preserva a ordenação por coluna e não altera
  status, dados ou visibilidade de outros usuários.
- Cozinha e a área de pedidos do site não receberão os filtros, evitando
  poluir fluxos especializados.

## Regra de classificação

1. `tipo = delivery` é **Delivery**.
2. `tipo = mesa` é **Mesa**.
3. Um pedido de balcão com `formaRecebimento = retirada` é **Retirada**.
4. Os demais pedidos de balcão são **Balcão**.

Essa regra usa dados já existentes no pedido; não requer migration nem mudança
em API.

## Interface

- Delivery usa azul e ícone de moto/caminhão.
- Mesa usa violeta e ícone de mesa/atendimento.
- Retirada usa verde e ícone de sacola.
- Balcão usa tom neutro e ícone de loja.
- Os botões de filtro exibem a quantidade de pedidos carregados para facilitar
  a leitura do volume de cada canal.
- As etiquetas serão reutilizadas no modal de detalhes para manter o mesmo
  vocabulário visual.

## Acessibilidade e falhas

- Cor não é o único sinal: todos os canais têm ícone e texto explícito.
- Os filtros são botões com `aria-pressed` e rótulos descritivos.
- Pedidos antigos sem campos opcionais continuam classificados como Balcão,
  salvo quando forem Mesa ou Delivery.

## Validação

- Verificar que os quatro canais recebem etiqueta correta.
- Verificar que cada filtro restringe todas as colunas sem alterar a contagem
  do banco ou o status de pedidos.
- Verificar build e lint do projeto.
