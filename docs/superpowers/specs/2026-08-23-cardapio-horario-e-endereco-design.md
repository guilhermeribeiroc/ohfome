# Cardápio público: disponibilidade e endereço

## Objetivo

Evitar que clientes montem pedidos quando o delivery estiver fechado e simplificar o preenchimento de endereço no checkout.

## Disponibilidade

- O restaurante configura uma única agenda de **delivery** por dia, com até quatro turnos diários.
- Essa agenda define quando o cardápio aceita novos pedidos. Fora dela, o cardápio permanece navegável, mas não permite adicionar produtos, abrir um pedido ou finalizar compra.
- O estado fechado é visível no cabeçalho antes dos produtos, com motivo e uma ação **Ver horários de delivery** que lista dias e turnos.
- A pausa manual continua tendo prioridade sobre a agenda e bloqueia pedidos imediatamente.
- A API pública mantém a verificação no servidor para impedir pedidos enviados por requisição direta.

## Seleção de produto

- Ao adicionar o primeiro item pelo detalhe de um produto, o detalhe fecha, o cliente volta ao cardápio e recebe confirmação breve com acesso ao carrinho.
- Quando indisponível, os controles de quantidade e o botão de adicionar não alteram o carrinho e explicam que o delivery está fechado.

## Endereço de entrega

- O checkout apresenta campos separados para Rua/Avenida, Número, Complemento opcional e Bairro.
- A validação exige rua, número e bairro somente para entrega.
- Antes de enviar o pedido, a interface compõe os campos em uma única descrição de endereço. A API e a impressão permanecem compatíveis com a coluna de endereço existente e pedidos anteriores.

## Verificação

- Testar cardápio aberto, fechado por agenda e fechado por pausa manual.
- Testar que nenhum item pode ser adicionado nos dois estados fechados.
- Testar retorno ao catálogo após adicionar item e preservação no carrinho.
- Testar envio e impressão de pedido com rua, número, complemento e taxa de bairro.
