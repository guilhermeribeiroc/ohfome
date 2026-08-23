# Demonstração Pizzaria Bom Sabor

## Objetivo

Transformar a conta teste publicada, preservando o acesso `teste123`, em uma demonstração completa e visualmente coerente de uma pizzaria. O resultado deve permitir gravar um vídeo mostrando o cardápio público, o pedido com Pix e a operação administrativa sem depender de marcas ou imagens de terceiros.

## Escopo aprovado

- Renomear o estabelecimento teste para **Pizzaria Bom Sabor** e classificá-lo como pizzaria.
- Substituir o cardápio de demonstração por 12 produtos ativos em quatro categorias: pizzas salgadas, pizzas doces, bebidas e promoções.
- Vincular uma foto original e consistente a cada produto, além de uma imagem de banner para o cardápio.
- Manter login, permissões, configuração de impressão, Pix e demais integrações já existentes na conta.
- Criar pedidos de demonstração representando etapas reais da operação: novo, em preparo, saiu para entrega e finalizado. Os pedidos devem ter itens, cliente, endereço quando delivery, total e forma de pagamento coerentes.

## Identidade visual

As imagens serão fotografias culinárias originais, com iluminação quente, fundo escuro discreto e composição de cardápio. Não terão logotipos, embalagens, marcas comerciais, texto incorporado ou marcas d'água. O banner mostrará uma pizza artesanal em ambiente acolhedor, sem texto; o sistema continuará exibindo o nome e as informações do restaurante sobre a imagem.

## Cardápio proposto

| Categoria | Produto | Preço de venda |
| --- | --- | ---: |
| Pizzas salgadas | Margherita grande | R$ 44,90 |
| Pizzas salgadas | Calabresa especial grande | R$ 46,90 |
| Pizzas salgadas | Frango com requeijão grande | R$ 48,90 |
| Pizzas salgadas | Portuguesa grande | R$ 49,90 |
| Pizzas salgadas | Quatro queijos grande | R$ 52,90 |
| Pizzas salgadas | Vegetariana grande | R$ 47,90 |
| Pizzas doces | Chocolate com morango grande | R$ 49,90 |
| Pizzas doces | Banana com canela grande | R$ 42,90 |
| Bebidas | Refrigerante cola 2 L | R$ 12,00 |
| Bebidas | Guaraná 2 L | R$ 11,00 |
| Promoções | Combo família: pizza + bebida | R$ 59,90 |
| Promoções | Combo casal: pizza média + bebida | R$ 42,90 |

## Dados e fluxo

1. Identificar a conta de demonstração pelo usuário `teste123` e seu estabelecimento associado.
2. Atualizar apenas os dados demonstrativos do estabelecimento, categorias, produtos, imagens e pedidos. Não alterar credenciais, vínculo do administrador, configurações de impressora ou credenciais de pagamento.
3. Reutilizar o mesmo mecanismo de armazenamento de imagens do sistema; a base receberá URLs servidas pela própria aplicação, não URLs temporárias do gerador.
4. Manter preços de custo e margem em cada produto para que Estoque & Preços também faça sentido no vídeo.
5. Validar o cardápio pelo URL público e a página administrativa após a carga dos dados.

## Tratamento de falhas

- Se o upload de qualquer imagem falhar, o produto continuará ativo com imagem padrão em vez de uma URL quebrada.
- A atualização dos dados será executada de forma transacional: não haverá cardápio parcialmente substituído.
- Pedidos já existentes não serão apagados; os pedidos de demonstração serão adicionados ou atualizados de maneira identificável.

## Critérios de aceite

- O nome Pizzaria Bom Sabor aparece no painel e no cardápio público.
- Os 12 produtos ativos aparecem organizados e com imagens carregadas.
- O cardápio tem banner de pizzaria e navegação por categoria funcional em desktop e celular.
- Há pedidos demonstrativos com status variados para gravação.
- O acesso de teste e as integrações existentes continuam funcionais.
