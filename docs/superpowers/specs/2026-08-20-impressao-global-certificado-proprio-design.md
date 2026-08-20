# Impressão global com estação do balcão e certificado próprio

## Objetivo

Fazer a impressão automática continuar funcionando enquanto qualquer tela autenticada do OhFome estiver aberta no computador configurado como estação do balcão. A operação não dependerá da página Cozinha, não exigirá reconexão manual ao trocar de módulo e não descartará pedidos durante falhas de internet, QZ Tray ou impressora.

A primeira versão atenderá uma estação e uma impressora térmica por estabelecimento. Pedidos do cardápio público, balcão, delivery e garçom/mesa usarão a mesma fila.

## Limites e garantias

- A impressão funciona enquanto existir uma página autenticada do OhFome aberta na estação do balcão e o QZ Tray estiver em execução.
- Fechar todas as páginas, encerrar o QZ Tray, desligar ou suspender o computador interrompe o processamento local. Os trabalhos permanecem na fila e são retomados quando a estação voltar.
- A fila garante que nenhum pedido aceito seja perdido e impede que duas abas processem o mesmo trabalho simultaneamente.
- Não existe garantia física absoluta de impressão exatamente uma vez: uma impressora pode receber os bytes e falhar antes de produzir o papel. O sistema reduzirá duplicidades, registrará resultados e oferecerá reimpressão manual para estados duvidosos.
- Separação por cozinha, bar, pizzaria ou múltiplas impressoras fica fora desta primeira versão.

## Arquitetura

### Serviço global de impressão

O processamento QZ deixará de pertencer ao `KanbanBoard` da Cozinha. Um provedor global será montado no layout autenticado da aplicação, acima das páginas dos módulos. Esse provedor não será desmontado ao navegar entre Balcão, Cozinha, Mesas, Delivery, Estoque ou Configurações.

O serviço somente será ativado quando o navegador estiver vinculado a uma estação habilitada para o estabelecimento autenticado. A configuração local conterá o identificador da estação, a impressora escolhida e a preferência de impressão automática. O nome da impressora permanecerá local porque pertence ao sistema operacional do computador.

Ao iniciar, o serviço:

1. carrega a configuração da estação;
2. configura o certificado e a assinatura QZ;
3. tenta conectar ao QZ Tray automaticamente;
4. valida se a impressora configurada ainda existe;
5. inicia o consumo da fila;
6. mantém o estado visível em todas as páginas.

### Reconexão e sincronização

A conexão usará retentativa progressiva, começando em poucos segundos e limitada a 30 segundos entre tentativas. Eventos de retorno da internet, foco da janela e visibilidade provocarão uma tentativa imediata. Fechamento inesperado do WebSocket do QZ alterará o estado para `reconectando` e iniciará o mesmo processo.

A fila continuará persistida no PostgreSQL. O cliente consultará trabalhos pendentes periodicamente e fará uma consulta imediata após conexão, reconexão ou retorno da internet. Uma futura evolução poderá trocar o polling por eventos do servidor sem alterar o contrato da fila.

### Uma única aba líder

Mais de uma aba do OhFome pode estar aberta no computador do balcão. Somente uma delas poderá consumir a fila. A eleição utilizará Web Locks quando disponível e um bloqueio com validade em armazenamento local como alternativa. As demais abas exibirão o estado da estação, mas não enviarão trabalhos à impressora.

Se a aba líder fechar, outra assume automaticamente após a validade curta do bloqueio.

### Reserva, confirmação e proteção contra duplicidade

Cada pedido enviado à cozinha gera um único trabalho automático em `impressao_jobs`. Reimpressões são trabalhos novos e explicitamente identificados.

O consumo seguirá este protocolo:

1. a estação reserva atomicamente o trabalho no servidor;
2. o servidor devolve um identificador de tentativa e uma validade da reserva;
3. o cliente envia o ESC/POS ao QZ Tray;
4. após o QZ aceitar o trabalho, o cliente registra um recibo local antes de confirmar o servidor;
5. o servidor marca o trabalho como concluído;
6. se a página recarregar entre as etapas 4 e 5, o recibo local permite confirmar sem imprimir novamente;
7. reservas abandonadas voltam para a fila após expirar.

Falhas conhecidas ficam registradas com mensagem e número de tentativas. Retentativas automáticas serão limitadas; depois do limite, o trabalho exigirá ação manual para evitar consumo de papel em ciclos de erro.

## Estações de impressão

Uma tabela de estações registrará, no mínimo:

- estabelecimento;
- identificador e nome da estação;
- estado ativo/inativo;
- última conexão e último trabalho concluído;
- versão do navegador e QZ Tray quando disponível;
- largura do papel, número de cópias e origens habilitadas;
- datas de criação e alteração.

A estação local será vinculada ao estabelecimento. Se outro estabelecimento entrar no mesmo navegador, a impressão não será iniciada com a configuração anterior. Desativar a estação no servidor interromperá o consumo na próxima sincronização.

Na primeira versão, cada estabelecimento terá uma estação ativa chamada `Balcão` e uma impressora. Todas as origens serão habilitadas por padrão: cardápio, balcão, delivery e garçom/mesa.

## Configurações de impressão

Será criada a página `Configurações → Impressão`, acessível ao administrador. Ela terá um assistente com estas etapas:

1. identificar Windows ou macOS;
2. verificar se o QZ Tray está instalado e em execução;
3. orientar a instalação do certificado OhFome;
4. conectar ao QZ Tray;
5. listar as impressoras encontradas;
6. selecionar a impressora térmica;
7. escolher largura de 58 mm ou 80 mm;
8. definir cópias, avanço final e corte quando suportado;
9. imprimir uma comanda de teste;
10. ativar o computador como estação do balcão.

A mesma página exibirá:

- estado `conectada`, `reconectando`, `desativada` ou `com erro`;
- nome da impressora local;
- último pedido impresso;
- quantidade aguardando;
- último erro e orientação de correção;
- ações para testar, reconectar, reimprimir e desativar a estação;
- seleção das origens que imprimem automaticamente.

Um indicador compacto e permanente no layout mostrará o estado da impressão em qualquer módulo. Usuários não administradores poderão ver o estado e os pedidos aguardando, mas somente administradores alterarão a configuração.

## Guia de instalação

O assistente conterá instruções específicas para Windows e macOS, com progresso salvo. O usuário leigo verá uma etapa por vez, com verificação automática sempre que possível.

O pacote inicial de instalação terá:

- link oficial para o QZ Tray suportado;
- certificado público da raiz OhFome;
- instalador ou script administrativo para configurar a confiança do QZ;
- instruções para instalar a impressora no sistema operacional;
- acesso direto à página de configuração e ao diagnóstico.

O guia tratará QZ fechado, impressora ausente, driver não instalado, fila do sistema operacional parada, papel ausente quando detectável e certificado não reconhecido.

Como o responsável pelo OhFome fará as primeiras instalações pessoalmente, a versão inicial pode usar um instalador administrativo assistido. Distribuição totalmente autônoma e instaladores assinados serão uma evolução posterior.

## Certificado próprio do OhFome

O projeto usará uma infraestrutura própria de confiança, suportada pelo QZ por `override.crt` ou `authcert.override`.

Serão criados:

- uma autoridade raiz OhFome, cuja chave privada ficará offline e nunca será enviada ao servidor;
- um certificado de assinatura emitido pela raiz;
- uma chave privada de assinatura armazenada somente como segredo do servidor;
- o certificado raiz público instalado em cada estação;
- a cadeia pública fornecida pelo endpoint autenticado do OhFome.

Separar raiz e certificado de assinatura permite renovar ou substituir a chave operacional sem reinstalar a raiz em todos os clientes. Se a raiz for comprometida, todas as estações precisarão receber uma nova raiz.

As variáveis existentes `QZ_CERTIFICATE` e `QZ_PRIVATE_KEY` continuarão sendo usadas para a cadeia pública e a chave operacional. O endpoint de assinatura permanecerá autenticado, limitará o tamanho da mensagem e nunca retornará a chave privada.

O certificado de demonstração será mantido apenas em ambientes de teste. Ele não fará parte do processo de instalação de clientes.

## Comandas

O formato continuará sendo ESC/POS raw. Em 58 mm serão usadas 32 colunas; a configuração de 80 mm poderá usar uma largura maior validada em teste físico. A altura será determinada pelo conteúdo, sem página A4 ou comprimento fixo.

A comanda incluirá:

- estabelecimento, número e origem do pedido;
- mesa, cliente ou identificação do balcão quando aplicável;
- horário e operador;
- itens, quantidades e observações;
- observação geral;
- forma de recebimento e pagamento quando relevante;
- avanço final curto e comando de corte somente quando suportado.

## Erros e recuperação

- QZ indisponível: estado `reconectando`; trabalhos permanecem pendentes.
- Impressora removida ou renomeada: impressão para e solicita nova seleção.
- Internet indisponível: nenhum trabalho é descartado; consumo retorna após reconexão.
- Erro no envio ao QZ: tentativa registrada e repetida dentro do limite.
- Resultado duvidoso: trabalho não entra em repetição infinita; operador decide pela reimpressão.
- Sessão encerrada: processamento para. Após novo login no mesmo estabelecimento, a estação é retomada.
- Estação desativada remotamente: consumo para sem apagar trabalhos.
- Duas abas: apenas a líder reserva e imprime.

## Segurança

- Chave raiz mantida offline e com backup protegido.
- Chave operacional armazenada apenas no gerenciador de segredos do servidor.
- Nenhuma chave privada no Git, navegador, instalador ou computador do cliente.
- APIs de estação, fila e assinatura exigem sessão autenticada e validam estabelecimento.
- Identificadores de estação não substituem autenticação.
- Ativação e desativação de estação ficam registradas para auditoria.
- A instalação da raiz exige privilégio administrativo e confirmação presencial nas primeiras implantações.
- Será documentado um procedimento de rotação da chave operacional e outro para comprometimento da raiz.

## Validação e critérios de aceite

### Fluxos funcionais

1. Pedido do cardápio público gera uma comanda.
2. Pedido de balcão gera uma comanda.
3. Pedido de delivery gera uma comanda.
4. Pedido de mesa lançado pelo garçom gera uma comanda.
5. Navegar para fora da Cozinha não interrompe a impressão.
6. Atualizar a página reconecta sem intervenção e sem repetir trabalho já confirmado.
7. Duas abas abertas produzem somente uma via automática.
8. Reimpressão manual produz uma nova via identificável.

### Falhas controladas

1. Encerrar e reabrir o QZ Tray recupera a conexão automaticamente.
2. Desconectar e reconectar a internet preserva e retoma a fila.
3. Desconectar a impressora registra erro sem perder o pedido.
4. Reiniciar a aplicação ou o banco não perde trabalhos pendentes.
5. Fechar todas as abas mantém os trabalhos no servidor; reabrir e autenticar retoma o consumo.
6. Trocar de estabelecimento no navegador não usa a estação vinculada ao estabelecimento anterior.

### Instalação

1. Instalação limpa em Windows detecta QZ e impressora e conclui um teste.
2. Instalação limpa em macOS detecta QZ e impressora e conclui um teste.
3. Após instalar a raiz própria, conexão e impressão assinada não exibem avisos repetitivos.
4. Um administrador leigo consegue concluir o assistente seguindo somente as instruções exibidas.

## Implantação gradual

1. Corrigir e testar a criação de pedidos de todas as origens na conta de demonstração.
2. Mover o serviço QZ para o layout global e implementar reconexão e liderança entre abas.
3. Fortalecer reserva, recibo local e confirmação da fila.
4. Criar cadastro de estação, indicador global e página de configuração.
5. Criar a raiz offline, o certificado operacional e o procedimento de rotação.
6. Criar os instaladores assistidos para macOS e Windows.
7. Validar primeiro no Mac e Oasis POS-58 atuais.
8. Executar instalação limpa no computador do primeiro cliente.
9. Liberar gradualmente para novos estabelecimentos, acompanhando erros e reimpressões.

## Fora de escopo

- Impressão sem nenhuma página do OhFome aberta.
- Aplicativo nativo ou agente desktop próprio.
- Aplicativo Android de impressão.
- Várias impressoras ou roteamento por setor.
- Impressão fiscal, NFC-e ou SAT.
- Distribuição autônoma por loja de aplicativos.
- Garantia física de exatamente uma impressão em falhas de hardware.
