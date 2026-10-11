# Sincronização entre Central de Pedidos e Delivery

## Objetivo

Manter a Central de pedidos e a aba Delivery coerentes para a mesma operação,
mesmo quando abertas em navegadores ou computadores diferentes. Uma alteração
deve ficar visível imediatamente na própria máquina e, em até cerca de um
segundo, nas outras estações que estiverem com a tela aberta.

## Decisão

Usar sincronização híbrida, sem introduzir infraestrutura de WebSocket:

1. Cada atualização bem-sucedida publica um evento local do domínio
   `ohfome:pedidos-atualizados`.
2. Um canal entre abas do navegador replica esse evento para Central e
   Delivery abertos na mesma máquina. Quando a plataforma não oferecer
   `BroadcastChannel`, um evento de `storage` é usado como alternativa.
3. Os consumidores dos dados de pedidos e entregas recebem o evento e fazem
   uma nova leitura imediatamente.
4. Enquanto a aba estiver visível, os endpoints operacionais usam polling de
   um segundo. Em segundo plano, conservam o intervalo atual de quatro
   segundos. Ao a aba voltar a ficar ativa, a leitura acontece de imediato.

Essa combinação mantém a sensação de tempo real entre computadores sem criar
um canal persistente que dependa do formato de hospedagem atual.

## Fonte de verdade e transições

O banco continua sendo a fonte de verdade. As rotas já atualizam pedido e
entrega na mesma transação e serão preservadas como única regra de transição:

| Ação | Pedido | Entrega |
| --- | --- | --- |
| Selecionar entregador no Delivery | `saiu_para_entrega` | `em_rota`, com entregador |
| Marcar entregue no Delivery | `finalizado` | `entregue` |
| Despachar na Central | `saiu_para_entrega` | `em_rota`, com entregador |
| Finalizar/cancelar na Central | `finalizado`/`cancelado` | `entregue`/`cancelada` |
| Criar pedido delivery em qualquer tela | novo pedido delivery | entrega aguardando quando aplicável |

Uma tela nunca deve tentar espelhar a outra apenas pelo estado local: ela
recebe o aviso e busca novamente as APIs protegidas.

## Componentes

- Um pequeno módulo cliente de eventos operacionais encapsula publicação e
  assinatura, inclusive a limpeza dos ouvintes.
- `usePolling` passa a ser sensível à visibilidade da aba e aceita a
  invalidação do domínio de pedidos sem acoplar componentes entre si.
- `KanbanBoard` publica a invalidação depois de criar, mover, despachar,
  finalizar, cancelar ou excluir pedido.
- `DeliveryModule` publica a invalidação depois de criar, atribuir
  entregador, mover ou concluir entrega.

## Experiência e falhas

- A tela que iniciou a ação mantém sua atualização otimista quando já existe.
- As demais telas recarregam da API; por isso recebem também entregador,
  endereço, estoque e qualquer regra calculada no servidor.
- Se uma alteração for rejeitada, a tela de origem recarrega e publica a
  invalidação para remover qualquer estado otimista incorreto.
- A sincronização de UI não substitui as validações transacionais da API;
  duas estações não conseguem concluir transições incompatíveis.

## Verificação

1. Abrir Central e Delivery em duas abas e em dois navegadores.
2. Despachar pela Central e confirmar que o cartão muda para `Em rota` no
   Delivery; concluir no Delivery e confirmar o pedido finalizado na Central.
3. Criar pedido delivery em cada tela e confirmar a presença na outra.
4. Cancelar pedido e confirmar que a entrega deixa de aparecer.
5. Verificar que a atualização ocorre ao retornar à aba depois de ela ter
   ficado em segundo plano.
6. Executar lint, build e testes existentes.
