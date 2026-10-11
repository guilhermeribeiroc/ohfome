# Plano de implementação — pizzas configuráveis

1. Criar a migration 038 com configuração de pizza, tamanhos, sabores e
   snapshot por item de pedido, incluindo RLS, índices e grants; espelhar no
   schema consolidado.
2. Expor configuração autenticada por produto para o administrador cadastrar
   regra de meio a meio, tamanhos e sabores com acréscimos.
3. Estender a criação interna do pedido para validar identificadores,
   recalcular valor de pizza no servidor e persistir snapshot.
4. Integrar o configurador de pizza à Central de Pedidos, inclusive quando o
   atendimento for delivery ou mesa, e mostrar a composição no ticket.
5. Executar TypeScript, lint, build e revisão de diff antes do commit/push.
