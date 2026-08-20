# Impressão automática de comandas com QZ Tray

## Objetivo

Imprimir automaticamente uma comanda térmica quando um pedido de balcão, garçom ou delivery for enviado à cozinha. A primeira versão usa uma única impressora por estabelecimento: a impressora da cozinha.

## Limites da primeira versão

- Uma impressora de cozinha por estabelecimento.
- Pedidos de balcão, mesa e delivery entram na mesma fila.
- Botão de reimpressão disponível para pedidos já impressos ou com falha.
- Sem separação de impressoras por setor nesta etapa.

## Arquitetura

### Fila persistente

Uma migração cria `impressao_jobs`, associada ao estabelecimento e ao pedido. Quando um pedido é enviado à cozinha, uma linha pendente é criada. A fila possui status `pendente`, `imprimindo`, `impresso` ou `falhou`, além de tentativa, erro e datas de criação/conclusão.

Uma restrição garante apenas uma impressão automática inicial por pedido. A reimpressão cria um novo trabalho ligado ao mesmo pedido, preservando o histórico.

### Estação da cozinha

A tela de Cozinha oferece um painel de impressão. No computador ligado à impressora, o administrador:

1. instala e abre o QZ Tray;
2. conecta o OhFome ao QZ Tray;
3. escolhe a impressora local POS-58;
4. ativa a impressão automática.

O nome da impressora é mantido localmente no navegador, pois nomes de impressora pertencem ao computador, não ao servidor. A fila continua no banco, evitando duplicidade e permitindo retentativas.

### Fluxo de impressão

1. O pedido é criado ou marcado como enviado à cozinha.
2. O banco inclui o trabalho na fila.
3. A estação da cozinha consulta trabalhos pendentes periodicamente.
4. Ela reserva o trabalho via API; outro navegador não pode imprimi-lo ao mesmo tempo.
5. O cliente gera ESC/POS com largura de 32 colunas, dados do pedido, itens e observações.
6. O QZ Tray envia os comandos raw para a POS-58: inicialização, texto, avanço curto e corte quando suportado.
7. A estação confirma `impresso` ou registra a falha para reimpressão.

Esse caminho não usa `window.print()`, tamanho A4 ou altura fixa de página. O comprimento físico é determinado pelo conteúdo e pelo avanço final do ESC/POS.

## Segurança e operação

- O QZ Tray deve estar instalado e em execução no computador da cozinha.
- A estação mantém a tela de Cozinha aberta para receber e processar a fila.
- Para operação sem avisos do QZ Tray, as requisições são assinadas digitalmente pelo servidor. Durante o teste inicial, a estação pode autorizar o OhFome manualmente uma vez.
- Falhas de conexão, impressora indisponível e erro de envio não descartam a comanda: o trabalho permanece identificável como falho e pode ser reimpresso.

## Interface

Na Cozinha:

- Indicador `QZ Tray conectado` ou `QZ Tray desconectado`.
- Seletor de impressora local e botão `Imprimir teste`.
- Chave `Impressão automática`.
- Ação `Reimprimir` no pedido e indicação do último resultado de impressão.

## Validação

1. Instalar QZ Tray no macOS e confirmar que a OIA-8387 aceita ESC/POS raw.
2. Imprimir ticket de teste, sem abrir a janela do navegador.
3. Criar um pedido de balcão, de mesa e de delivery; cada um deve gerar uma única comanda.
4. Desligar a impressora; confirmar que o trabalho é marcado como falho e pode ser reimpresso.
5. Confirmar que o ticket termina logo após os itens, sem uma página fixa extra.

