-- Carga do cardápio de pizzas da pizzaria "Sabores da Pizza".
--
-- O que faz (tudo numa transação):
--   1. Cria/atualiza UM produto "Pizza" e UM produto "Pizza Doce", cada um com os
--      tamanhos P, M e G e todos os sabores com o preço exato de cada tamanho
--      (tabela pizza_sabor_precos, migração 046).
--   2. Meio a meio: tamanho P NÃO aceita; M e G aceitam, cobrando a média dos
--      dois sabores (metade de cada).
--   3. Desativa (não apaga) os produtos antigos que eram a mesma pizza repetida
--      em P, M e G, para não quebrar pedidos antigos.
--
-- Requer a migração 046 aplicada. Pode ser rodado de novo sem duplicar nada.
--
-- Como usar (no console do Postgres):
--   Teste, sem gravar nada (mostra o que seria feito):
--     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f carga_sabores_da_pizza.sql
--   Aplicar de verdade:
--     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v aplicar=1 -f carga_sabores_da_pizza.sql

\set ON_ERROR_STOP on
begin;

do $carga$
declare
  v_est uuid;
  v_nome_est text;
  v_qtd int;
  v_grupo jsonb;
  v_sabor jsonb;
  v_cat uuid;
  v_prod uuid;
  v_ordem int;
  v_tam record;
  v_id uuid;
  v_tam_ids jsonb;
  v_antigos int;
  v_nomes_sabores text[];
  v_menu jsonb := $json$
[
  {"produto": "Pizza", "categoria": "Pizzas", "sabores": [
    {"n": "Americana", "d": "Presunto, bacon, queijo, azeitonas, tomate e orégano", "p": 22, "m": 26, "g": 34},
    {"n": "A Moda", "d": "Presunto, milho, salsicha, cebola, catupiry, ovo, frango, queijo, tomate e orégano", "p": 23, "m": 28, "g": 38},
    {"n": "Bacon", "d": "Queijo, bacon, cebola, tomate e orégano", "p": 22, "m": 27, "g": 37},
    {"n": "Brasileira", "d": "Calabresa, ovo, cebola, ervilha, queijo, tomate e orégano", "p": 21, "m": 26, "g": 34},
    {"n": "Baiana", "d": "Calabresa, ovo, cebola, queijo, tomate e orégano", "p": 20, "m": 25, "g": 32},
    {"n": "Calabresa", "d": "Queijo, calabresa, cebola e orégano", "p": 22, "m": 27, "g": 36},
    {"n": "Calabresa Especial", "d": "Queijo, calabresa e batata frita", "p": 30, "m": 35, "g": 45},
    {"n": "Califórnia", "d": "Presunto, bacon, calabresa, frango, salsicha, ovo, catupiry, queijo, azeitonas, tomate e orégano", "p": 24, "m": 30, "g": 40},
    {"n": "Ceciliana", "d": "Presunto, calabresa, bacon, queijo, tomate e orégano", "p": 21, "m": 26, "g": 35},
    {"n": "Caipira", "d": "Presunto, frango, milho, queijo, tomate e orégano", "p": 21, "m": 26, "g": 33},
    {"n": "Carne de Sol", "d": "Carne de sol, milho, queijo, cebola, tomate e orégano", "p": 24, "m": 30, "g": 40},
    {"n": "Carne de Sol Especial", "d": "Carne de sol trinchada, queijo e batata frita", "p": 32, "m": 37, "g": 50},
    {"n": "Cearense", "d": "Carne, milho, ervilha, queijo, tomate e orégano", "p": 18, "m": 24, "g": 30},
    {"n": "Frango", "d": "Frango, queijo, milho, ervilha, orégano e tomate", "p": 21, "m": 26, "g": 34},
    {"n": "Frango Catupiry", "d": "Frango, catupiry, azeitonas, tomate e orégano", "p": 22, "m": 27, "g": 36},
    {"n": "Francesa", "d": "Calabresa, salsicha, ovo, milho, ervilha, frango, queijo, tomate e orégano", "p": 22, "m": 25, "g": 36},
    {"n": "Italiana", "d": "Presunto, milho, salsicha, ovo, frango, queijo, tomate e orégano", "p": 22, "m": 27, "g": 36},
    {"n": "Maravilha", "d": "Presunto, ovo, calabresa, queijo, tomate e orégano", "p": 20, "m": 26, "g": 36},
    {"n": "Mista", "d": "Presunto, milho, queijo, tomate e orégano", "p": 20, "m": 25, "g": 32},
    {"n": "Mussarela", "d": "Queijo, azeitonas, tomate e orégano", "p": 22, "m": 27, "g": 35},
    {"n": "Margarita", "d": "Mussarela, manjericão, tomate e orégano", "p": 21, "m": 25, "g": 32},
    {"n": "Paulista", "d": "Calabresa, milho, cebola, queijo, tomate e orégano", "p": 22, "m": 27, "g": 34},
    {"n": "Portuguesa", "d": "Presunto, calabresa, ovo, milho, ervilha, cebola, queijo, tomate e orégano", "p": 22, "m": 27, "g": 36},
    {"n": "Sabores", "d": "Presunto, bacon, calabresa, frango, salsicha, ovo, milho, ervilha, cebola, catupiry, queijo, tomate e orégano", "p": 28, "m": 33, "g": 45},
    {"n": "4 Queijos", "d": "Catupiry, cheddar, queijo coalho, mussarela, tomate, azeitonas e orégano", "p": 24, "m": 30, "g": 40}
  ]},
  {"produto": "Pizza Doce", "categoria": "Pizzas Doces", "sabores": [
    {"n": "Chocolate", "d": "Chocolate", "p": 23, "m": 27, "g": 37},
    {"n": "Banana", "d": "Banana, canela e leite condensado", "p": 20, "m": 25, "g": 35},
    {"n": "Chocolate Mesclado", "d": "Chocolate branco e chocolate preto", "p": 25, "m": 30, "g": 40},
    {"n": "Brigadeiro", "d": "Chocolate e brigadeiro", "p": 23, "m": 27, "g": 37},
    {"n": "Choconina", "d": "Chocolate, banana e leite condensado", "p": 23, "m": 27, "g": 37},
    {"n": "Disquete", "d": "Chocolate e disquete", "p": 24, "m": 28, "g": 38},
    {"n": "Romeu e Julieta", "d": "Queijo e goiabada", "p": 23, "m": 27, "g": 37},
    {"n": "Chocolate c/ Morango", "d": "Chocolate e morango", "p": 28, "m": 35, "g": 45}
  ]}
]
$json$::jsonb;
begin
  -- 1. Acha a pizzaria (precisa ser exatamente uma).
  select count(*) into v_qtd from estabelecimentos where nome ilike '%sabores%da%pizza%';
  if v_qtd <> 1 then
    raise exception 'Esperava 1 estabelecimento parecido com "Sabores da Pizza" e achei %. Estabelecimentos com "pizza": %', v_qtd,
      (select string_agg(nome || ' (' || id || ')', '; ') from estabelecimentos where nome ilike '%pizza%');
  end if;
  select id, nome into v_est, v_nome_est from estabelecimentos where nome ilike '%sabores%da%pizza%';
  perform set_config('app.estabelecimento_id', v_est::text, true);
  raise notice 'Estabelecimento: % (%)', v_nome_est, v_est;

  select array_agg(lower(s->>'n')) into v_nomes_sabores
  from jsonb_array_elements(v_menu) g, jsonb_array_elements(g->'sabores') s;

  -- 2. Cada grupo vira UM produto de pizza com P, M, G.
  for v_grupo in select * from jsonb_array_elements(v_menu) loop
    v_cat := null; v_prod := null;
    select id into v_cat from categorias_produto
      where estabelecimento_id = v_est and lower(nome) = lower(v_grupo->>'categoria');
    if v_cat is null then
      -- Reaproveita uma categoria parecida que a loja já tenha.
      select id into v_cat from categorias_produto
        where estabelecimento_id = v_est
          and lower(nome) in (case when v_grupo->>'produto' = 'Pizza Doce' then 'pizza doce' else 'pizza' end,
                              case when v_grupo->>'produto' = 'Pizza Doce' then 'doces' else 'pizzas salgadas' end)
        limit 1;
    end if;
    if v_cat is null then
      insert into categorias_produto (estabelecimento_id, nome, ordem_exibicao)
      values (v_est, v_grupo->>'categoria', (select coalesce(max(ordem_exibicao), -1) + 1 from categorias_produto where estabelecimento_id = v_est))
      returning id into v_cat;
    end if;

    select id into v_prod from produtos
      where estabelecimento_id = v_est and lower(nome) = lower(v_grupo->>'produto') and tipo_produto = 'pizza'
      limit 1;
    if v_prod is null then
      insert into produtos (estabelecimento_id, categoria_id, nome, modo_precificacao, preco_custo, margem_percentual, preco_venda, tipo_produto)
      values (v_est, v_cat, v_grupo->>'produto', 'preco_manual', 0, 0, 0, 'pizza')
      returning id into v_prod;
    end if;
    update produtos set categoria_id = v_cat, tamanho = null, ativo = true, tipo_produto = 'pizza',
      preco_venda = (select min((s->>'p')::numeric) from jsonb_array_elements(v_grupo->'sabores') s), updated_at = now()
    where id = v_prod;

    -- Meio a meio cobra a média dos dois sabores (metade de cada).
    insert into produto_configuracoes_pizza (produto_id, estabelecimento_id, regra_meio_a_meio)
    values (v_prod, v_est, 'media')
    on conflict (produto_id) do update set regra_meio_a_meio = 'media', updated_at = now();
    delete from pizza_tamanhos where produto_id = v_prod;   -- recria do zero (apaga em cascata os preços)
    delete from pizza_sabores where produto_id = v_prod;

    v_tam_ids := '{}'::jsonb;
    v_ordem := 0;
    for v_tam in
      select * from (values ('P', 'p', false), ('M', 'm', true), ('G', 'g', true)) t(nome, chave, meio)
    loop
      insert into pizza_tamanhos (produto_id, estabelecimento_id, nome, preco_sabor_unico, permite_meio_a_meio, ativo, ordem)
      values (v_prod, v_est, v_tam.nome,
        (select min((s->>v_tam.chave)::numeric) from jsonb_array_elements(v_grupo->'sabores') s),
        v_tam.meio, true, v_ordem)
      returning id into v_id;
      v_tam_ids := v_tam_ids || jsonb_build_object(v_tam.chave, v_id);
      v_ordem := v_ordem + 1;
    end loop;

    v_ordem := 0;
    for v_sabor in select * from jsonb_array_elements(v_grupo->'sabores') loop
      insert into pizza_sabores (produto_id, estabelecimento_id, nome, descricao, acrescimo, permite_meio_a_meio, ativo, ordem)
      values (v_prod, v_est, v_sabor->>'n', v_sabor->>'d', 0, true, true, v_ordem)
      returning id into v_id;
      insert into pizza_sabor_precos (sabor_id, tamanho_id, estabelecimento_id, preco)
      select v_id, (v_tam_ids->>c)::uuid, v_est, (v_sabor->>c)::numeric from unnest(array['p','m','g']) c;
      v_ordem := v_ordem + 1;
    end loop;
    raise notice 'Produto "%": % sabores x 3 tamanhos (P sem meio a meio; M e G com meio a meio pela média)', v_grupo->>'produto', v_ordem;
  end loop;

  -- 3. Desativa os cadastros antigos (a mesma pizza repetida em P, M, G).
  raise notice 'Produtos antigos que serão DESATIVADOS:';
  for v_sabor in
    select to_jsonb(x) from (
      select p.id, p.nome, p.tamanho
      from produtos p
      where p.estabelecimento_id = v_est and p.ativo
        and p.tipo_produto = 'padrao'
        and (p.tamanho is not null or p.nome ~* '(^| )(p|m|g|pequena|média|media|grande)$')
        and lower(regexp_replace(regexp_replace(p.nome, '^\s*pizza( doce)?\s+', '', 'i'), '\s*\(?\m(p|m|g|pequena|média|media|grande)\M\)?\s*$', '', 'i')) = any (v_nomes_sabores)
    ) x
  loop
    raise notice '  - % (tamanho %)', v_sabor->>'nome', coalesce(v_sabor->>'tamanho', '-');
  end loop;

  update produtos p set ativo = false, updated_at = now()
  where p.estabelecimento_id = v_est and p.ativo and p.tipo_produto = 'padrao'
    and (p.tamanho is not null or p.nome ~* '(^| )(p|m|g|pequena|média|media|grande)$')
    and lower(regexp_replace(regexp_replace(p.nome, '^\s*pizza( doce)?\s+', '', 'i'), '\s*\(?\m(p|m|g|pequena|média|media|grande)\M\)?\s*$', '', 'i')) = any (v_nomes_sabores);
  get diagnostics v_antigos = row_count;
  raise notice 'Total de produtos antigos desativados: %', v_antigos;

  -- Outras pizzas configuráveis que não sejam as duas novas (ex.: um teste anterior): só avisa.
  raise notice 'Outras pizzas configuráveis ativas (NÃO alteradas, confira): %',
    (select coalesce(string_agg(nome, ', '), 'nenhuma') from produtos
      where estabelecimento_id = v_est and ativo and tipo_produto = 'pizza' and nome not in ('Pizza', 'Pizza Doce'));
end
$carga$;

\if :{?aplicar}
  commit;
  \echo '>>> APLICADO.'
\else
  rollback;
  \echo '>>> TESTE: nada foi gravado. Para aplicar rode de novo com -v aplicar=1'
\endif
