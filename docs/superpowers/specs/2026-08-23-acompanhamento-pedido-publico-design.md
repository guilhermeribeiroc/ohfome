# Acompanhamento público de pedidos em tempo real

## Objetivo

Garantir que o cliente que mantém aberta a tela **Acompanhar meu pedido** veja
automaticamente cada mudança de status feita pela operação, sem recarregar a
página.

## Diagnóstico e decisão

O acompanhamento já possui polling no navegador, mas a rota pública precisa
declarar explicitamente que sua resposta não pode ser armazenada em cache.
Como a recarga manual também mostrou um estado antigo, a entrega de uma
resposta atual é o ponto prioritário.

Foi escolhida a solução de polling sem cache, em vez de SSE ou WebSocket. Ela
é compatível com navegador, celular e PWA sem manter conexões persistentes na
infraestrutura atual.

## Fluxo

1. A operação atualiza o status do pedido no painel.
2. A API pública de status consulta o status atual do pedido e envia uma
   resposta dinâmica, com `Cache-Control: no-store`.
3. A tela pública consulta essa rota a cada três segundos e consulta
   imediatamente ao voltar o foco para a aba ou PWA.
4. Quando o status recebido muda, a interface atualiza a linha do tempo e
   mostra uma confirmação breve, por exemplo: “Pedido agora está em preparo”.

## Alterações técnicas

- Declarar a rota `GET /api/publico/[slug]/pedidos/[id]` como dinâmica e sem
  revalidação de cache.
- Enviar cabeçalhos `Cache-Control: no-store, max-age=0` na resposta pública.
- Registrar uma versão/horário de atualização no payload público para tornar
  inequívoca a mudança para o navegador e para o polling.
- Estender o polling público para sincronizar imediatamente em `focus` e em
  `visibilitychange` quando a página volta a ficar visível.
- No componente de acompanhamento, comparar o status anterior e exibir um
  aviso acessível que não interrompe a leitura da linha do tempo.

## Resiliência

- Falhas pontuais de rede mantêm o último status exibido e a próxima rodada
  tenta novamente.
- O polling não abre múltiplos intervalos nem faz solicitações em duplicidade
  após retorno ao primeiro plano.
- O caminho de Pix continua usando a mesma rota e não altera as regras de
  confirmação de pagamento.

## Validação

- Testar que a rota retorna `Cache-Control: no-store`.
- Simular dois status consecutivos e verificar que o acompanhamento reflete a
  mudança sem recarga manual.
- Verificar retorno ao foco da aba e no PWA.
- Executar checagem de tipos e lint dos arquivos alterados.
