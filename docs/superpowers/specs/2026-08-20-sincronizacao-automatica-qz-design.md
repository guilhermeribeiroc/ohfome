# Sincronização automática da estação QZ Tray

## Objetivo

Quando o OhFome for aberto em uma área autenticada, reconectar automaticamente ao QZ Tray somente no navegador que já foi configurado como estação de impressão. A estação deve retomar a fila sem exigir que o operador abra a tela de Cozinha.

## Escopo

- Ler a impressora, largura, cópias e preferência de impressão automática salvas no navegador.
- Quando houver uma impressora salva e a impressão automática estiver ativada, iniciar a conexão ao QZ logo após o carregamento da área autenticada.
- Em falha de conexão, repetir com espera progressiva até 30 segundos, inclusive após foco da janela ou retorno da rede.
- Ao conectar, consultar a fila e processar os pedidos pendentes sob a reserva e o heartbeat já existentes.
- Exibir no indicador global um estado claro para conexão, conexão ativa e espera por QZ/impressora.
- Não tentar conexão em dispositivos sem impressora previamente configurada ou sem impressão automática ativada.

## Fluxo

1. O layout autenticado monta o componente global da estação de impressão.
2. O componente carrega as preferências locais da estação.
3. Caso haja estação configurada, essa aba candidata-se a líder e inicia a conexão com QZ Tray.
4. Se a conexão falhar, a mesma aba líder agenda nova tentativa progressiva.
5. Quando a conexão for restabelecida, a aba líder processa a fila pendente exatamente uma vez por job, usando reserva, token e heartbeat.
6. Uma segunda aba do mesmo navegador acompanha o status, mas não compete pela impressão.

## Falhas e limites

- QZ fechado, impressora sem energia, sem papel ou computador em suspensão impedem a impressão física; a estação mantém a tentativa de reconexão enquanto o OhFome estiver aberto.
- A primeira configuração continua manual: instalar driver e QZ, autorizar o certificado, escolher a fila e ativar a impressão automática.
- A configuração é local ao navegador/estação para evitar que dispositivos de garçom tentem imprimir.

## Verificação

- Abrir o OhFome em uma estação previamente configurada com QZ já aberto: status deve conectar sem clique.
- Abrir com QZ fechado e iniciá-lo depois: status deve mudar para conectado sem recarregar a página.
- Criar pedido de balcão ou cardápio enquanto a estação estiver aberta: deve ser reservado e impresso uma vez.
- Abrir uma segunda aba: apenas uma deve coordenar a fila.
- Abrir em navegador sem configuração: não deve tentar conexão nem exibir erro invasivo.
