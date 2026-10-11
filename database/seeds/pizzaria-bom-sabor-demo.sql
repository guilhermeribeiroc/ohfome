-- Conta demonstrativa permanente: restaurante teste123 / slug restauranteteste.
-- Execute somente após as migrations 033 e 034. A carga é idempotente e não
-- apaga pedidos nem produtos criados manualmente durante uma apresentação.

begin;

do $$
declare
  v_estabelecimento_id uuid;
  v_admin_id uuid;
  v_produto_id uuid;
  v_categoria_id uuid;
  v_cliente_ana uuid;
  v_cliente_marcos uuid;
  v_cliente_carol uuid;
  v_entregador_ana uuid;
  v_mesa_demo uuid;
  v_comanda_demo uuid;
  v_pedido uuid;
  v_catalogo record;
  v_novo_estoque integer;
  v_hash_auxiliar constant text := '$2b$12$Bgcaki0Ac1rT69FkqPPI/eagaeLC9kRglVPVel.yFm9ZL2ZNoXWhi';
  v_marcador constant text := 'Demonstração Pizzaria Bom Sabor';
begin
  select e.id, u.id
    into v_estabelecimento_id, v_admin_id
    from estabelecimentos e
    join usuarios u on u.estabelecimento_id = e.id and u.usuario = 'teste123'
   where e.slug = 'restauranteteste'
   for update of e;

  if v_estabelecimento_id is null then
    raise exception 'Conta de demonstração restauranteteste/teste123 não encontrada';
  end if;

  update estabelecimentos
     set nome = 'Pizzaria Bom Sabor', tipo = 'pizzaria',
         tipo_comida = 'Pizzas artesanais, combos e bebidas', cardapio_banner_modo = 'fixo',
         demonstracao = true, onboarding_concluido = true
   where id = v_estabelecimento_id;

  delete from banners_cardapio where estabelecimento_id = v_estabelecimento_id;
  insert into banners_cardapio (estabelecimento_id, url, ordem, enquadramento)
  values (v_estabelecimento_id, '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a001.jpg', 0, 'centro');

  insert into estabelecimento_modulos (estabelecimento_id, modulo)
  select v_estabelecimento_id, m::modulo_sistema from unnest(enum_range(null::modulo_sistema)) as m
  on conflict do nothing;

  insert into categorias_produto (estabelecimento_id, nome, ordem_exibicao)
  values
    (v_estabelecimento_id, 'Pizzas salgadas', 1), (v_estabelecimento_id, 'Pizzas doces', 2),
    (v_estabelecimento_id, 'Combos', 3), (v_estabelecimento_id, 'Porções', 4),
    (v_estabelecimento_id, 'Bebidas', 5), (v_estabelecimento_id, 'Sobremesas', 6)
  on conflict (estabelecimento_id, nome) do update set ordem_exibicao = excluded.ordem_exibicao;

  -- A referência técnica protege produtos criados manualmente de uma nova seed.
  for v_catalogo in
    select * from (values
      ('margherita', 'Pizzas salgadas', 'Pizza Margherita', 'G'::tamanho_produto, 'Molho artesanal, muçarela, tomate fresco e manjericão.', 20.00::numeric, 44.90::numeric, false, null::integer, '001'),
      ('calabresa', 'Pizzas salgadas', 'Pizza Calabresa Especial', 'G'::tamanho_produto, 'Calabresa fatiada, muçarela, cebola roxa e orégano.', 21.00::numeric, 46.90::numeric, false, null::integer, '002'),
      ('frango-requeijao', 'Pizzas salgadas', 'Pizza Frango com Requeijão', 'G'::tamanho_produto, 'Frango desfiado, muçarela e requeijão cremoso.', 22.00::numeric, 48.90::numeric, false, null::integer, '003'),
      ('portuguesa', 'Pizzas salgadas', 'Pizza Portuguesa', 'G'::tamanho_produto, 'Presunto, ovo, cebola, azeitona, muçarela e orégano.', 22.50::numeric, 49.90::numeric, false, null::integer, '003'),
      ('quatro-queijos', 'Pizzas salgadas', 'Pizza Quatro Queijos', 'G'::tamanho_produto, 'Muçarela, provolone, parmesão e gorgonzola.', 24.00::numeric, 52.90::numeric, false, null::integer, '004'),
      ('mucarela', 'Pizzas salgadas', 'Pizza Muçarela', 'G'::tamanho_produto, 'Muçarela derretida, tomate e orégano.', 19.00::numeric, 42.90::numeric, false, null::integer, '004'),
      ('pepperoni', 'Pizzas salgadas', 'Pizza Pepperoni', 'G'::tamanho_produto, 'Pepperoni, muçarela e molho artesanal.', 25.00::numeric, 54.90::numeric, false, null::integer, '005'),
      ('nordestina', 'Pizzas salgadas', 'Pizza Nordestina', 'G'::tamanho_produto, 'Carne de sol, cebola roxa, nata e muçarela.', 26.00::numeric, 56.90::numeric, false, null::integer, '006'),
      ('vegetariana', 'Pizzas salgadas', 'Pizza Vegetariana', 'G'::tamanho_produto, 'Tomate, pimentão, cebola, azeitona e muçarela.', 21.50::numeric, 47.90::numeric, false, null::integer, '004'),
      ('bacon-milho', 'Pizzas salgadas', 'Pizza Bacon com Milho', 'G'::tamanho_produto, 'Bacon crocante, milho, muçarela e catupiry.', 24.00::numeric, 53.90::numeric, false, null::integer, '005'),
      ('chocolate-morango', 'Pizzas doces', 'Pizza Chocolate com Morango', 'G'::tamanho_produto, 'Chocolate cremoso, morangos frescos e raspas de chocolate.', 23.00::numeric, 49.90::numeric, false, null::integer, '005'),
      ('banana-canela', 'Pizzas doces', 'Pizza Banana com Canela', 'G'::tamanho_produto, 'Banana fatiada, canela, açúcar e calda de caramelo.', 18.50::numeric, 42.90::numeric, false, null::integer, '006'),
      ('romeu-julieta', 'Pizzas doces', 'Pizza Romeu e Julieta', 'G'::tamanho_produto, 'Goiabada cremosa, muçarela e toque de canela.', 19.50::numeric, 44.90::numeric, false, null::integer, '005'),
      ('doce-leite', 'Pizzas doces', 'Pizza Doce de Leite', 'G'::tamanho_produto, 'Doce de leite cremoso, farofa doce e canela.', 20.00::numeric, 45.90::numeric, false, null::integer, '006'),
      ('combo-familia', 'Combos', 'Combo Família', null::tamanho_produto, 'Pizza grande de calabresa, refrigerante 2 L e sobremesa.', 35.00::numeric, 69.90::numeric, false, null::integer, '007'),
      ('combo-casal', 'Combos', 'Combo Casal', null::tamanho_produto, 'Pizza grande de muçarela e refrigerante 1 L.', 27.00::numeric, 54.90::numeric, false, null::integer, '007'),
      ('combo-amigos', 'Combos', 'Combo Amigos', null::tamanho_produto, 'Duas pizzas grandes e refrigerante 2 L.', 55.00::numeric, 109.90::numeric, false, null::integer, '007'),
      ('combo-almoco', 'Combos', 'Combo Almoço Rápido', null::tamanho_produto, 'Fatia de pizza, porção de batata e bebida.', 15.00::numeric, 29.90::numeric, false, null::integer, '007'),
      ('batata-frita', 'Porções', 'Batata Frita Crocante', null::tamanho_produto, 'Batatas sequinhas, tempero da casa e molho especial.', 8.00::numeric, 18.90::numeric, false, null::integer, '007'),
      ('frango-frito', 'Porções', 'Frango Frito', null::tamanho_produto, 'Tirinhas de frango empanadas com molho barbecue.', 12.00::numeric, 25.90::numeric, false, null::integer, '007'),
      ('polenta', 'Porções', 'Polenta Frita', null::tamanho_produto, 'Polenta crocante com parmesão e ervas.', 6.00::numeric, 16.90::numeric, false, null::integer, '007'),
      ('bolinho-queijo', 'Porções', 'Bolinho de Queijo', null::tamanho_produto, 'Seis bolinhos artesanais de queijo.', 9.00::numeric, 19.90::numeric, false, null::integer, '007'),
      ('coca-lata', 'Bebidas', 'Coca-Cola Lata', null::tamanho_produto, 'Refrigerante gelado, lata 350 ml.', 3.50::numeric, 7.00::numeric, true, 20, '007'),
      ('coca-zero-lata', 'Bebidas', 'Coca-Cola Zero Lata', null::tamanho_produto, 'Refrigerante zero açúcar, lata 350 ml.', 3.50::numeric, 7.00::numeric, true, 12, '007'),
      ('guarana-lata', 'Bebidas', 'Guaraná Lata', null::tamanho_produto, 'Refrigerante gelado, lata 350 ml.', 3.20::numeric, 6.50::numeric, true, 15, '007'),
      ('coca-2l', 'Bebidas', 'Coca-Cola 2 L', null::tamanho_produto, 'Refrigerante família bem gelado.', 7.00::numeric, 13.90::numeric, true, 8, '007'),
      ('guarana-2l', 'Bebidas', 'Guaraná 2 L', null::tamanho_produto, 'Refrigerante família bem gelado.', 6.50::numeric, 12.90::numeric, true, 8, '007'),
      ('agua-sem-gas', 'Bebidas', 'Água Mineral', null::tamanho_produto, 'Água mineral sem gás, 500 ml.', 1.50::numeric, 4.00::numeric, true, 18, '007'),
      ('pudim', 'Sobremesas', 'Pudim de Leite', null::tamanho_produto, 'Fatia generosa de pudim caseiro com calda.', 4.00::numeric, 10.90::numeric, true, 6, '006'),
      ('petit-gateau', 'Sobremesas', 'Petit Gâteau', null::tamanho_produto, 'Bolo quente de chocolate com sorvete de creme.', 8.50::numeric, 18.90::numeric, true, 5, '005'),
      ('brownie', 'Sobremesas', 'Brownie com Sorvete', null::tamanho_produto, 'Brownie de chocolate, sorvete e calda.', 7.50::numeric, 16.90::numeric, true, 5, '005')
    ) as c(chave, categoria, nome, tamanho, descricao, preco_custo, preco_venda, controla_estoque, saldo_inicial, imagem)
  loop
    select r.entidade_id into v_produto_id from demonstracao_referencias r
      join produtos p on p.id = r.entidade_id and p.estabelecimento_id = r.estabelecimento_id
     where r.estabelecimento_id = v_estabelecimento_id and r.tipo = 'produto' and r.chave = v_catalogo.chave;
    -- A versão anterior da seed não tinha referências técnicas. Na primeira
    -- execução desta versão, adota somente seus itens reconhecíveis, por nome
    -- e imagem legados, antes de criar itens novos.
    if v_produto_id is null then
      select p.id into v_produto_id
        from produtos p
       where p.estabelecimento_id = v_estabelecimento_id
         and p.nome = case v_catalogo.chave
           when 'coca-2l' then 'Refrigerante Cola 2 L'
           when 'guarana-2l' then 'Refrigerante Guaraná 2 L'
           else v_catalogo.nome
         end
         and p.imagem_url like '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a%.jpg'
         and not exists (
           select 1 from demonstracao_referencias r
            where r.estabelecimento_id = v_estabelecimento_id
              and r.tipo = 'produto' and r.entidade_id = p.id
         )
       order by p.created_at, p.id
       limit 1;
    end if;
    select id into v_categoria_id from categorias_produto
     where estabelecimento_id = v_estabelecimento_id and nome = v_catalogo.categoria;
    if v_produto_id is null then
      insert into produtos (estabelecimento_id, categoria_id, nome, tamanho, descricao, imagem_url, modo_precificacao, preco_custo, preco_venda, ativo, controla_estoque_unidades)
      values (v_estabelecimento_id, v_categoria_id, v_catalogo.nome, v_catalogo.tamanho, v_catalogo.descricao, '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a' || v_catalogo.imagem || '.jpg', 'preco_manual', v_catalogo.preco_custo, v_catalogo.preco_venda, true, v_catalogo.controla_estoque)
      returning id into v_produto_id;
      insert into demonstracao_referencias (estabelecimento_id, tipo, chave, entidade_id)
      values (v_estabelecimento_id, 'produto', v_catalogo.chave, v_produto_id);
    else
      insert into demonstracao_referencias (estabelecimento_id, tipo, chave, entidade_id)
      values (v_estabelecimento_id, 'produto', v_catalogo.chave, v_produto_id)
      on conflict (estabelecimento_id, tipo, chave) do update set entidade_id = excluded.entidade_id;
      update produtos set categoria_id = v_categoria_id, nome = v_catalogo.nome, tamanho = v_catalogo.tamanho,
        descricao = v_catalogo.descricao, imagem_url = '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a' || v_catalogo.imagem || '.jpg',
        modo_precificacao = 'preco_manual', preco_custo = v_catalogo.preco_custo, preco_venda = v_catalogo.preco_venda,
        ativo = true, controla_estoque_unidades = v_catalogo.controla_estoque
      where id = v_produto_id and estabelecimento_id = v_estabelecimento_id;
    end if;
    if v_catalogo.controla_estoque then
      insert into estoque_produtos (produto_id, estabelecimento_id, saldo_fisico)
      values (v_produto_id, v_estabelecimento_id, v_catalogo.saldo_inicial) on conflict do nothing;
      get diagnostics v_novo_estoque = row_count;
      if v_novo_estoque > 0 then
        insert into movimentacoes_estoque_produtos (estabelecimento_id, produto_id, usuario_id, tipo, quantidade, motivo, saldo_fisico_resultante)
        values (v_estabelecimento_id, v_produto_id, v_admin_id, 'entrada', v_catalogo.saldo_inicial, 'Carga inicial da demonstração', v_catalogo.saldo_inicial);
      end if;
    end if;
  end loop;

  insert into usuarios (estabelecimento_id, nome, usuario, senha_hash, role, ativo)
  values
    (v_estabelecimento_id, 'Bianca Balcão', 'demo.bomsabor.balcao', v_hash_auxiliar, 'balcao', true),
    (v_estabelecimento_id, 'Carlos Cozinha', 'demo.bomsabor.cozinha', v_hash_auxiliar, 'cozinha', true),
    (v_estabelecimento_id, 'Elisa Estoque', 'demo.bomsabor.estoque', v_hash_auxiliar, 'estoque', true),
    (v_estabelecimento_id, 'Caio Caixa', 'demo.bomsabor.caixa', v_hash_auxiliar, 'caixa', true),
    (v_estabelecimento_id, 'Davi Delivery', 'demo.bomsabor.delivery', v_hash_auxiliar, 'delivery', true)
  on conflict (usuario) do update set nome = excluded.nome, role = excluded.role, ativo = true
  where usuarios.estabelecimento_id = v_estabelecimento_id;

  insert into entregadores (estabelecimento_id, nome, veiculo, telefone, disponivel, ativo)
  select v_estabelecimento_id, x.nome, x.veiculo, x.telefone, true, true
    from (values ('Moto Demo Ana', 'Moto', '85999999001'), ('Moto Demo João', 'Moto', '85999999002')) as x(nome, veiculo, telefone)
   where not exists (select 1 from entregadores e where e.estabelecimento_id = v_estabelecimento_id and e.nome = x.nome);
  update entregadores set ativo = true, disponivel = true
   where estabelecimento_id = v_estabelecimento_id and nome in ('Moto Demo Ana', 'Moto Demo João');
  select id into v_entregador_ana from entregadores where estabelecimento_id = v_estabelecimento_id and nome = 'Moto Demo Ana' order by id limit 1;

  insert into clientes (estabelecimento_id, nome, telefone, endereco, ponto_referencia, email, notificar_pedido)
  values
    (v_estabelecimento_id, 'Ana Paula Demo', '85999998001', 'Rua das Flores, 120 - Centro', 'Apartamento 203', 'ana.demo@example.test', true),
    (v_estabelecimento_id, 'Marcos Silva Demo', '85999998002', 'Av. Beira Mar, 450 - Meireles', 'Portaria azul', 'marcos.demo@example.test', true),
    (v_estabelecimento_id, 'Carol Santos Demo', '85999998003', 'Rua do Sol, 75 - Aldeota', 'Casa amarela', 'carol.demo@example.test', false),
    (v_estabelecimento_id, 'Diego Lima Demo', '85999998004', 'Av. Santos Dumont, 900 - Papicu', 'Loja 12', 'diego.demo@example.test', false),
    (v_estabelecimento_id, 'Fernanda Alves Demo', '85999998005', 'Rua das Acácias, 88 - Benfica', 'Próximo à praça', 'fernanda.demo@example.test', true)
  on conflict (estabelecimento_id, telefone) do update set nome = excluded.nome, endereco = excluded.endereco,
    ponto_referencia = excluded.ponto_referencia, email = excluded.email, notificar_pedido = excluded.notificar_pedido;
  select id into v_cliente_ana from clientes where estabelecimento_id = v_estabelecimento_id and telefone = '85999998001';
  select id into v_cliente_marcos from clientes where estabelecimento_id = v_estabelecimento_id and telefone = '85999998002';
  select id into v_cliente_carol from clientes where estabelecimento_id = v_estabelecimento_id and telefone = '85999998003';

  insert into bairros_entrega (estabelecimento_id, nome, taxa, ativo)
  values (v_estabelecimento_id, 'Centro', 5.00, true), (v_estabelecimento_id, 'Aldeota', 7.00, true),
    (v_estabelecimento_id, 'Meireles', 6.00, true), (v_estabelecimento_id, 'Benfica', 8.00, true), (v_estabelecimento_id, 'Papicu', 9.00, true)
  on conflict (estabelecimento_id, nome) do update set taxa = excluded.taxa, ativo = true;

  insert into mesas (estabelecimento_id, numero, capacidade, status)
  select v_estabelecimento_id, x.numero, x.capacidade, 'livre'
    from (values (1, 2), (2, 2), (3, 4), (4, 4), (5, 6), (6, 6), (99, 4)) as x(numero, capacidade)
  on conflict (estabelecimento_id, numero) do update set capacidade = excluded.capacidade;
  select id into v_mesa_demo from mesas where estabelecimento_id = v_estabelecimento_id and numero = 99;

  delete from custos_fixos where estabelecimento_id = v_estabelecimento_id and descricao like '[Demonstração] %';
  insert into custos_fixos (estabelecimento_id, categoria, descricao, valor_mensal, dia_vencimento)
  values (v_estabelecimento_id, 'Aluguel', '[Demonstração] Aluguel do ponto', 3200.00, 5),
    (v_estabelecimento_id, 'Internet', '[Demonstração] Internet e telefone', 189.90, 10),
    (v_estabelecimento_id, 'Energia', '[Demonstração] Energia elétrica', 680.00, 15);
  delete from movimentacoes_financeiras where estabelecimento_id = v_estabelecimento_id and descricao like '[Demonstração] %';
  insert into movimentacoes_financeiras (estabelecimento_id, tipo, categoria, descricao, valor, data_movimento, usuario_id)
  values (v_estabelecimento_id, 'entrada', 'Vendas', '[Demonstração] Vendas do dia', 1280.50, current_date - 1, v_admin_id),
    (v_estabelecimento_id, 'saida', 'Insumos', '[Demonstração] Compra de bebidas', 245.00, current_date - 1, v_admin_id),
    (v_estabelecimento_id, 'entrada', 'Vendas', '[Demonstração] Vendas no balcão', 735.40, current_date, v_admin_id);

  delete from movimentacoes_estoque_produtos where pedido_id in (select id from pedidos where estabelecimento_id = v_estabelecimento_id and notificado_mensagem = v_marcador);
  delete from estoque_compromissos_produtos where pedido_id in (select id from pedidos where estabelecimento_id = v_estabelecimento_id and notificado_mensagem = v_marcador);
  delete from entregas where pedido_id in (select id from pedidos where estabelecimento_id = v_estabelecimento_id and notificado_mensagem = v_marcador);
  delete from pedidos where estabelecimento_id = v_estabelecimento_id and notificado_mensagem = v_marcador;
  update comandas set status = 'fechada', fechada_em = coalesce(fechada_em, now()) where mesa_id = v_mesa_demo and status = 'aberta';
  insert into comandas (mesa_id, garcom_id, status) values (v_mesa_demo, v_admin_id, 'aberta') returning id into v_comanda_demo;

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, cliente_id, usuario_id, forma_recebimento, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, observacoes, notificado_mensagem)
  values (v_estabelecimento_id, 'delivery', 'app', 'novo', true, 'cozinha', v_cliente_ana, v_admin_id, 'entrega', 'pix', 'pago', 46.90, 5.00, 51.90, 'Sem cebola, por favor.', v_marcador) returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, estabelecimento_id, quantidade, preco_unitario, observacoes)
  select v_pedido, entidade_id, v_estabelecimento_id, 1, 46.90, 'Sem cebola, por favor.' from demonstracao_referencias where estabelecimento_id = v_estabelecimento_id and tipo = 'produto' and chave = 'calabresa';

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, cliente_id, usuario_id, forma_recebimento, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'delivery', 'telefone', 'em_preparo', true, 'cozinha', v_cliente_marcos, v_admin_id, 'entrega', 'cartao', 'pago', 48.90, 6.00, 54.90, v_marcador) returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, estabelecimento_id, quantidade, preco_unitario)
  select v_pedido, entidade_id, v_estabelecimento_id, 1, 48.90 from demonstracao_referencias where estabelecimento_id = v_estabelecimento_id and tipo = 'produto' and chave = 'frango-requeijao';

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, cliente_id, usuario_id, forma_recebimento, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'delivery', 'whatsapp', 'pronto', true, 'cozinha', v_cliente_carol, v_admin_id, 'entrega', 'dinheiro', 'pendente', 49.90, 7.00, 56.90, v_marcador) returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, estabelecimento_id, quantidade, preco_unitario)
  select v_pedido, entidade_id, v_estabelecimento_id, 1, 49.90 from demonstracao_referencias where estabelecimento_id = v_estabelecimento_id and tipo = 'produto' and chave = 'portuguesa';
  insert into entregas (pedido_id, endereco, bairro, tempo_estimado_min) values (v_pedido, 'Rua do Sol, 75', 'Aldeota', 35);

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, cliente_id, usuario_id, forma_recebimento, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'delivery', 'app', 'saiu_para_entrega', true, 'cozinha', v_cliente_ana, v_admin_id, 'entrega', 'cartao', 'pago', 52.90, 5.00, 57.90, v_marcador) returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, estabelecimento_id, quantidade, preco_unitario)
  select v_pedido, entidade_id, v_estabelecimento_id, 1, 52.90 from demonstracao_referencias where estabelecimento_id = v_estabelecimento_id and tipo = 'produto' and chave = 'quatro-queijos';
  insert into entregas (pedido_id, entregador_id, status, endereco, bairro, tempo_estimado_min, saiu_em)
  values (v_pedido, v_entregador_ana, 'em_rota', 'Rua das Flores, 120', 'Centro', 25, now() - interval '12 minutes');

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, usuario_id, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'balcao', 'presencial', 'finalizado', true, 'cozinha', v_admin_id, 'dinheiro', 'pago', 69.90, 0, 69.90, v_marcador) returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, estabelecimento_id, quantidade, preco_unitario)
  select v_pedido, entidade_id, v_estabelecimento_id, 1, 69.90 from demonstracao_referencias where estabelecimento_id = v_estabelecimento_id and tipo = 'produto' and chave = 'combo-familia';

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, comanda_id, usuario_id, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'mesa', 'presencial', 'pronto', true, 'cozinha', v_comanda_demo, v_admin_id, 'cartao', 'pendente', 54.90, 0, 54.90, v_marcador) returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, estabelecimento_id, quantidade, preco_unitario)
  select v_pedido, entidade_id, v_estabelecimento_id, 1, 54.90 from demonstracao_referencias where estabelecimento_id = v_estabelecimento_id and tipo = 'produto' and chave = 'combo-casal';

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, usuario_id, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'balcao', 'presencial', 'cancelado', false, 'balcao', v_admin_id, 'cartao', 'falhou', 18.90, 0, 18.90, v_marcador) returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, estabelecimento_id, quantidade, preco_unitario)
  select v_pedido, entidade_id, v_estabelecimento_id, 1, 18.90 from demonstracao_referencias where estabelecimento_id = v_estabelecimento_id and tipo = 'produto' and chave = 'batata-frita';
end;
$$;

commit;
