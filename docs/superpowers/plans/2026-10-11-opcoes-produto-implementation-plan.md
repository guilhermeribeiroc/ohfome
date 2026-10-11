# Plano: opções configuráveis por produto

1. Criar migration com grupos/opções de produto e snapshots por item de pedido,
   RLS, índices e grants.
2. Expor rotas autenticadas para administrar grupos/opções e incluí-los na
   leitura de produtos, além da leitura pública do cardápio.
3. Validar opções no servidor ao criar pedido, calcular os acréscimos a partir
   do banco e persistir snapshots por item.
4. Adicionar cadastro de grupos/opções na edição de produto.
5. Criar configurador reutilizável e integrá-lo aos quatro canais de pedido,
   mantendo configurações diferentes como linhas distintas na sacola.
6. Exibir snapshots em detalhes, cozinha e impressão; testar regras,
   segurança, build e migration.
