# Cardápio público: navegação e checkout responsivos

## Objetivo

Corrigir os fluxos críticos do cardápio público para que a compra seja clara, acessível e consistente em celular e desktop, sem alterar a regra de criação de pedido, Pix Mercado Pago ou impressão.

## Decisões aprovadas

- O detalhe do produto terá uma ação textual explícita para voltar ao cardápio, além de fechar por `Esc` e pelo botão voltar do navegador.
- Produto, carrinho, Pix, informações e pedidos passam a funcionar como diálogos acessíveis: foco preso no painel, fundo bloqueado, foco restaurado ao fechar e rolagem de fundo bloqueada.
- O carrinho continuará com duas etapas: revisão e dados. A etapa de dados organizará a compra em blocos progressivos: recebimento, contato/endereço, pagamento e resumo.
- Pix, cartão e dinheiro serão opções iguais de uma única seção “Como deseja pagar?”. Detalhes específicos aparecem somente após a escolha.
- No celular, o conteúdo do checkout deve rolar sem ficar coberto pelo resumo fixo. No desktop, o painel será mais largo e continuará com resumo visível.
- A navegação inferior é exclusiva de telas pequenas. Em desktop, as ações de pedido e informações ficam no cabeçalho para não competir com o conteúdo.
- As abas Comidas e Bebidas serão filtros de conteúdo real, não apenas atalhos de rolagem.
- O carrinho e suas observações serão persistidos por cardápio no navegador até o pedido ser concluído ou os itens serem removidos.

## Arquitetura

`CardapioPublico` continuará como orquestrador de dados, seleção de categoria, carrinho e overlays. A lógica de diálogo e rolagem será centralizada em um componente/utilitário reutilizável para todos os painéis.

O checkout continuará enviando exatamente o mesmo contrato para `POST /api/publico/[slug]/pedidos`. A refatoração só altera a ordem, apresentação, validação local e acessibilidade dos campos.

## Critérios de aceite

1. Produto aberto sempre exibe “Voltar ao cardápio”; `Esc`, botão voltar e botão do navegador fecham o painel sem sair do cardápio.
2. Não há conteúdo da tela de fundo acessível ou rolável enquanto um painel está aberto.
3. Em 360×800 e 390×844, nenhum campo ou CTA do checkout fica coberto por barras fixas ou área segura.
4. Pix, cartão e dinheiro aparecem no mesmo grupo e apenas a opção escolhida apresenta suas instruções complementares.
5. Entrega exige bairro e endereço; retirada não mostra esses campos. Os erros aparecem perto do campo inválido.
6. Em 1024 px ou mais, não existe navegação inferior fixa; o pedido permanece sempre alcançável.
7. Trocar entre Comidas e Bebidas altera a lista exibida e preserva categoria/rolagem previsível.
8. Recarregar o cardápio preserva itens e observações, mas concluir o pedido limpa o carrinho.
9. Não há rolagem horizontal nos viewports de teste 360, 390, 768, 1366 e 1440 px.
10. O favicon usa PNG/ICO versionados para reduzir cache da marca antiga.

## Fora do escopo desta etapa

- Variantes/complementos de produto, que exigem modelagem de dados própria.
- Alteração do contrato Mercado Pago ou do processo de confirmação do Pix.
- Mudanças de banco para horário de funcionamento; isso fica em uma entrega posterior.

## Validação

- Lint e build do Next.js.
- Fluxos manuais de produto, carrinho, entrega, retirada, Pix, cartão e dinheiro em desktop e celular.
- Verificação de foco, `Esc`, retorno do navegador, estados de erro e ausência de overflow horizontal.
