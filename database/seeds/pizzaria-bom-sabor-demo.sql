-- Conta de demonstração publicada: usuário teste123 / slug restauranteteste.
-- Atualiza somente os dados demonstrativos do estabelecimento; login,
-- configurações de impressão e integrações de pagamento são preservados.

begin;

do $$
declare
  v_estabelecimento_id uuid;
  v_produtos integer;
  v_cliente_ana uuid;
  v_cliente_marcos uuid;
  v_pedido uuid;
  v_calabresa uuid;
  v_frango uuid;
  v_portuguesa uuid;
  v_quatro_queijos uuid;
  v_chocolate uuid;
  v_combo_familia uuid;
  v_combo_casal uuid;
begin
  select e.id
  into v_estabelecimento_id
  from estabelecimentos e
  join usuarios u on u.estabelecimento_id = e.id
  where e.slug = 'restauranteteste' and u.usuario = 'teste123'
  for update of e;

  if v_estabelecimento_id is null then
    raise exception 'Conta de demonstração restauranteteste/teste123 não encontrada';
  end if;

  select count(*) into v_produtos
  from produtos
  where estabelecimento_id = v_estabelecimento_id;

  if v_produtos <> 12 then
    raise exception 'A demonstração esperava 12 produtos e encontrou %', v_produtos;
  end if;

  update estabelecimentos
  set nome = 'Pizzaria Bom Sabor',
      tipo = 'pizzaria',
      tipo_comida = 'Pizzas artesanais, combos e bebidas',
      cardapio_banner_modo = 'fixo'
  where id = v_estabelecimento_id;

  delete from banners_cardapio where estabelecimento_id = v_estabelecimento_id;
  insert into banners_cardapio (estabelecimento_id, url, ordem, enquadramento)
  values (v_estabelecimento_id, '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a001.jpg', 0, 'centro');

  insert into categorias_produto (estabelecimento_id, nome, ordem_exibicao)
  values
    (v_estabelecimento_id, 'Pizzas salgadas', 1),
    (v_estabelecimento_id, 'Pizzas doces', 2),
    (v_estabelecimento_id, 'Bebidas', 3),
    (v_estabelecimento_id, 'Promoções', 4)
  on conflict (estabelecimento_id, nome) do update
    set ordem_exibicao = excluded.ordem_exibicao;

  with catalogo(ordem, categoria, nome, tamanho, descricao, imagem_url, preco_custo, preco_venda) as (
    values
      (1, 'Pizzas salgadas', 'Pizza Margherita', 'G'::tamanho_produto, 'Molho artesanal, muçarela, tomate fresco e manjericão.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a001.jpg', 20.00::numeric, 44.90::numeric),
      (2, 'Pizzas salgadas', 'Pizza Calabresa Especial', 'G'::tamanho_produto, 'Calabresa fatiada, muçarela, cebola roxa e orégano.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a002.jpg', 21.00::numeric, 46.90::numeric),
      (3, 'Pizzas salgadas', 'Pizza Frango com Requeijão', 'G'::tamanho_produto, 'Frango desfiado, muçarela e requeijão cremoso.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a003.jpg', 22.00::numeric, 48.90::numeric),
      (4, 'Pizzas salgadas', 'Pizza Portuguesa', 'G'::tamanho_produto, 'Presunto, ovo, cebola, azeitona, muçarela e orégano.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a003.jpg', 22.50::numeric, 49.90::numeric),
      (5, 'Pizzas salgadas', 'Pizza Quatro Queijos', 'G'::tamanho_produto, 'Muçarela, provolone, parmesão e gorgonzola.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a004.jpg', 24.00::numeric, 52.90::numeric),
      (6, 'Pizzas salgadas', 'Pizza Vegetariana', 'G'::tamanho_produto, 'Muçarela, tomate, pimentão, cebola, azeitona e orégano.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a004.jpg', 21.50::numeric, 47.90::numeric),
      (7, 'Pizzas doces', 'Pizza Chocolate com Morango', 'G'::tamanho_produto, 'Chocolate cremoso, morangos frescos e raspas de chocolate.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a005.jpg', 23.00::numeric, 49.90::numeric),
      (8, 'Pizzas doces', 'Pizza Banana com Canela', 'G'::tamanho_produto, 'Banana fatiada, canela, açúcar e calda de caramelo.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a006.jpg', 18.50::numeric, 42.90::numeric),
      (9, 'Bebidas', 'Refrigerante Cola 2 L', null, 'Gelado para acompanhar sua pizza.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a007.jpg', 6.50::numeric, 12.00::numeric),
      (10, 'Bebidas', 'Refrigerante Guaraná 2 L', null, 'Gelado para acompanhar sua pizza.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a007.jpg', 6.00::numeric, 11.00::numeric),
      (11, 'Promoções', 'Combo Família', null, 'Pizza grande de calabresa e refrigerante 2 L.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a007.jpg', 29.00::numeric, 59.90::numeric),
      (12, 'Promoções', 'Combo Casal', null, 'Pizza média de muçarela e refrigerante 600 ml.', '/api/arquivos/banners/10f07d37-b15f-4d9b-a6e1-f0c71c84a007.jpg', 20.00::numeric, 42.90::numeric)
  ), existentes as (
    select id, row_number() over (order by created_at, id) as ordem
    from produtos
    where estabelecimento_id = v_estabelecimento_id
  )
  update produtos p
  set categoria_id = c.id,
      nome = d.nome,
      tamanho = d.tamanho,
      descricao = d.descricao,
      imagem_url = d.imagem_url,
      modo_precificacao = 'preco_manual',
      preco_custo = d.preco_custo,
      preco_venda = d.preco_venda,
      ativo = true
  from existentes e
  join catalogo d on d.ordem = e.ordem
  join categorias_produto c on c.estabelecimento_id = v_estabelecimento_id and c.nome = d.categoria
  where p.id = e.id;

  delete from categorias_produto c
  where c.estabelecimento_id = v_estabelecimento_id
    and c.nome not in ('Pizzas salgadas', 'Pizzas doces', 'Bebidas', 'Promoções');

  insert into clientes (estabelecimento_id, nome, telefone, endereco, ponto_referencia, notificar_pedido)
  values (v_estabelecimento_id, 'Ana Paula', '85990000001', 'Rua das Flores, 120 - Centro', 'Apartamento 203', true)
  on conflict (estabelecimento_id, telefone) do update
    set nome = excluded.nome, endereco = excluded.endereco, ponto_referencia = excluded.ponto_referencia
  returning id into v_cliente_ana;

  insert into clientes (estabelecimento_id, nome, telefone, endereco, ponto_referencia, notificar_pedido)
  values (v_estabelecimento_id, 'Marcos Silva', '85990000002', 'Av. Beira Mar, 450 - Meireles', 'Portaria azul', true)
  on conflict (estabelecimento_id, telefone) do update
    set nome = excluded.nome, endereco = excluded.endereco, ponto_referencia = excluded.ponto_referencia
  returning id into v_cliente_marcos;

  select id into v_calabresa from produtos where estabelecimento_id = v_estabelecimento_id and nome = 'Pizza Calabresa Especial';
  select id into v_frango from produtos where estabelecimento_id = v_estabelecimento_id and nome = 'Pizza Frango com Requeijão';
  select id into v_portuguesa from produtos where estabelecimento_id = v_estabelecimento_id and nome = 'Pizza Portuguesa';
  select id into v_quatro_queijos from produtos where estabelecimento_id = v_estabelecimento_id and nome = 'Pizza Quatro Queijos';
  select id into v_chocolate from produtos where estabelecimento_id = v_estabelecimento_id and nome = 'Pizza Chocolate com Morango';
  select id into v_combo_familia from produtos where estabelecimento_id = v_estabelecimento_id and nome = 'Combo Família';
  select id into v_combo_casal from produtos where estabelecimento_id = v_estabelecimento_id and nome = 'Combo Casal';

  delete from pedidos
  where estabelecimento_id = v_estabelecimento_id
    and notificado_mensagem = 'Demonstração Pizzaria Bom Sabor';

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, cliente_id, forma_recebimento, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, observacoes, notificado_mensagem)
  values (v_estabelecimento_id, 'delivery', 'app', 'novo', true, 'cozinha', v_cliente_ana, 'entrega', 'pix', 'pago', 46.90, 5.00, 51.90, 'Sem cebola, por favor.', 'Demonstração Pizzaria Bom Sabor')
  returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, observacoes)
  values (v_pedido, v_calabresa, 1, 46.90, 'Sem cebola, por favor.');

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, cliente_id, forma_recebimento, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'delivery', 'app', 'em_preparo', true, 'cozinha', v_cliente_marcos, 'entrega', 'pix', 'pago', 48.90, 6.00, 54.90, 'Demonstração Pizzaria Bom Sabor')
  returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
  values (v_pedido, v_frango, 1, 48.90);

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, cliente_id, forma_recebimento, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'delivery', 'telefone', 'saiu_para_entrega', true, 'cozinha', v_cliente_ana, 'entrega', 'cartao', 'pendente', 52.90, 5.00, 57.90, 'Demonstração Pizzaria Bom Sabor')
  returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
  values (v_pedido, v_quatro_queijos, 1, 52.90);

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'balcao', 'presencial', 'finalizado', true, 'cozinha', 'dinheiro', 'pago', 102.80, 0, 102.80, 'Demonstração Pizzaria Bom Sabor')
  returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
  values
    (v_pedido, v_combo_familia, 1, 59.90),
    (v_pedido, v_chocolate, 1, 42.90);

  insert into pedidos (estabelecimento_id, tipo, origem, status, enviado_cozinha, destino_preparo, forma_pagamento, pagamento_status, subtotal, taxa_entrega, total, notificado_mensagem)
  values (v_estabelecimento_id, 'balcao', 'presencial', 'finalizado', true, 'cozinha', 'cartao', 'pago', 42.90, 0, 42.90, 'Demonstração Pizzaria Bom Sabor')
  returning id into v_pedido;
  insert into itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
  values (v_pedido, v_combo_casal, 1, 42.90);
end;
$$;

commit;
