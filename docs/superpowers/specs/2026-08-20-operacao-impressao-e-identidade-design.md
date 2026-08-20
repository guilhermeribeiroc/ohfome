# Operação de impressão, personalização e identidade

**Data:** 2026-08-20  
**Status:** aprovado para planejamento técnico

## Objetivo

Elevar a confiabilidade da estação de impressão do OhFome e aprimorar a personalização do cardápio e a identidade da autenticação, sem aumentar a complexidade para quem opera um restaurante.

## Escopo e ordem

1. Estação de impressão e seu indicador global.
2. Precificação bidirecional de produtos.
3. Banner personalizável do cardápio público.
4. Identidade visual do login.

O trabalho é separado nessas frentes para que a impressão, que afeta a operação da cozinha, possa ser entregue e validada antes das mudanças visuais.

## 1. Estação de impressão

### Contexto

A aplicação já mantém o componente QZ Tray no layout autenticado, possui fila persistente no PostgreSQL, reserva atômica de jobs, tentativas de envio e reconexão automática. O próximo passo é tornar a estação observável, exclusiva por computador e mais resiliente a quedas transitórias.

### Experiência

- O indicador de impressão fica fixo no canto superior direito em todas as telas internas.
- Ele comunica conexão, reconexão, ausência de impressora, QZ fechado, fila pendente e falha.
- Seu painel mostra impressora escolhida, impressão automática, quantidade de pedidos pendentes, último pedido enviado e ação para recuperar falhas.
- A estação fixa do balcão inicia o QZ Tray junto do computador e mantém o sistema aberto durante a operação.

### Arquitetura

- Cada navegador recebe um identificador persistente de estação.
- Uma coordenação entre abas garante que somente uma aba da estação consuma a fila. As demais permanecem informativas.
- A API vincula a reserva de um job à estação que a realizou e valida a mesma estação ao concluir ou falhar a impressão.
- A reconexão usa espera progressiva, verificação periódica do websocket do QZ e retomada automática da fila.
- Os jobs são processados em ordem de criação e permanecem no PostgreSQL até confirmação do envio ao spooler do QZ Tray.
- Falhas recuperáveis retornam à fila; após o limite de tentativas, o job fica visível como falho e pode ser reenviado manualmente.
- Um registro local de jobs enviados reduz duplicações depois de recarregar a página. A reserva no servidor evita concorrência entre estações.

### Limite operacional

Não é possível garantir impressão física enquanto o computador estiver desligado, suspenso, sem papel, sem rede ou com QZ Tray encerrado. Nesses casos, o sistema deve preservar a fila e retomá-la quando a estação voltar a ficar disponível. A confirmação do QZ significa envio ao spooler, não prova física de que o papel saiu; por isso haverá reimpressão explícita e histórico de falhas em vez de uma promessa incorreta de entrega exatamente uma vez.

### Critérios de aceite

- A estação conectada imprime pedidos de balcão, mesa, delivery e retirada em ordem.
- Com duas abas abertas na mesma estação, cada job é consumido uma vez.
- Ao reiniciar QZ, reconectar a impressora ou recuperar a internet, os jobs pendentes voltam a ser processados sem ação manual.
- Um job que exceda o limite de tentativas aparece com motivo e botão de reenvio.
- O indicador global não cobre controles essenciais em desktop ou celular.

## 2. Precificação bidirecional

### Experiência

Os campos **preço de custo**, **margem** e **preço de venda** ficam editáveis. O último campo numérico alterado determina qual valor é recalculado:

| Campo alterado | Campo recalculado |
| --- | --- |
| Custo | Venda |
| Margem | Venda |
| Venda | Margem |

- A fórmula da margem é `(venda - custo) / custo × 100`.
- Venda abaixo do custo é permitida, com margem negativa e alerta de prejuízo.
- Com custo igual a zero, a margem é apresentada como não calculável até que exista um custo válido.
- O servidor aplica a mesma regra para que a base de dados seja a fonte final dos valores salvos.

### Persistência

- A restrição atual que impede margem negativa será migrada.
- O modo de precificação existente permanece como metadado de origem do último cálculo, sem exigir que o usuário escolha um modo antes de editar.
- Preço de venda continua não negativo; margem pode ser negativa.

### Critérios de aceite

- Editar venda recalcula e persiste a margem imediatamente.
- Editar custo ou margem recalcula e persiste a venda imediatamente.
- Uma margem negativa é salva e destacada visualmente.
- Custo zero nunca produz percentual infinito ou enganoso.

## 3. Banner do cardápio público

### Experiência

Na área **Cardápio Digital**, a seção **Aparência do cardápio** oferece:

- Sem imagem, preservando o banner visual atual.
- Imagem fixa de fundo.
- Carrossel com até cinco imagens, ordenáveis, com transição a cada cinco segundos e indicadores de navegação.

Cada imagem possui prévia com recorte 16:9. Uma camada de contraste é aplicada automaticamente para assegurar que nome, logo e textos continuem legíveis. O carrossel respeita a preferência do sistema por movimento reduzido.

### Persistência e segurança

- A configuração do modo do banner pertence ao estabelecimento.
- As imagens de banner são registros ordenados, vinculados ao estabelecimento.
- Uploads deixam de depender apenas do filesystem efêmero do container.
- A implementação inicial usará armazenamento persistente configurado no EasyPanel, com uma camada de armazenamento que permita migrar para S3/R2 futuramente sem mudar a interface.
- Tipos permitidos: JPG, PNG e WebP; limite de tamanho e validação no servidor.

### Critérios de aceite

- O administrador envia, reordena, remove e visualiza até cinco imagens.
- O cardápio público usa a configuração correta sem expor controles de edição.
- Sem banners configurados, o cardápio mantém sua aparência atual.
- Uma imagem adicionada continua disponível após novo deploy.

## 4. Identidade no login

### Experiência

- A logo completa OhFome ganha presença maior no desktop e no celular.
- O ícone OhFome funciona como marca-d'água e detalhe de fundo, sem competir com campos ou mensagens de erro.
- O painel institucional continua explicando o produto de modo breve.
- O formulário mantém foco operacional: usuário, senha e ação de entrar.
- A identidade é sempre a do OhFome, não a logo do restaurante autenticado.

### Critérios de aceite

- A logo completa é nítida em desktop e celular.
- O formulário continua acessível por teclado e legível em telas pequenas.
- Não há mudança no fluxo de autenticação ou no contrato da API de login.

## Estratégia de validação

1. Testes de tipos, lint e build.
2. Testes manuais de pedido em todas as origens e modalidades.
3. Simulações de QZ fechado, fila pendente, internet indisponível, recarga de página, duas abas e reimpressão.
4. Testes de precificação positiva, negativa e custo zero.
5. Testes de upload, ordenação e persistência de banner após deploy.
6. Verificação responsiva do cardápio e login em celular e desktop.

## Fora deste escopo

- Um agente de impressão nativo ou aplicativo executável independente do navegador. A estação web com QZ Tray será endurecida agora; um agente nativo pode ser uma evolução posterior se for necessário imprimir sem uma aba do sistema aberta.
- Troca automática entre múltiplas impressoras por setor. A primeira versão continua usando uma impressora configurada para a estação do balcão.
