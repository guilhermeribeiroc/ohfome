# Formas de pagamento no novo pedido

## Objetivo

O atendente deve poder registrar dinheiro, cartão ou Pix em pedidos de balcão,
retirada e delivery, sem perder a regra de segurança do Pix automático.

## Interface

O modal de novo pedido mostra uma seção de pagamento para balcão, retirada e
delivery. Ela contém Dinheiro, Cartão e Pix.

- **Dinheiro:** revela apenas o campo opcional `Troco para: R$`.
- **Cartão:** revela Crédito e Débito.
- **Pix no balcão e retirada:** permite `Pix manual` ou `Pix automático`.
- **Pix no delivery:** permite `Pix na entrega` ou `Pix automático`.

Mesa permanece fora deste escopo porque seu pagamento é definido no
fechamento da comanda.

## Regras de dados

As formas manual, na entrega, dinheiro e cartão criam o pedido e o enviam
normalmente à cozinha. Pix automático cria uma cobrança e mantém
`enviado_cozinha=false` até a confirmação do Mercado Pago. O valor de troco
somente é enviado e salvo quando a forma é dinheiro.

## Validação

O servidor valida forma, tipo de cartão, valor de troco positivo e a
combinação Pix automático. O navegador não calcula nem escolhe preço de
pedido. Falhas de geração do QR liberam a reserva de estoque.

## Testes

Validar as três formas em balcão, retirada e delivery; dinheiro sem troco e
com troco; cartão crédito/débito; Pix manual/no recebimento; Pix automático;
e a compilação de produção.
