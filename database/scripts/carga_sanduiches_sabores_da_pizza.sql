-- Carga dos sanduíches da pizzaria "Sabores da Pizza".
--
-- O que faz (tudo numa transação):
--   1. Para cada sanduíche do cardápio cria (ou atualiza) UM produto, com a pergunta
--      "Pão" obrigatória e com o preço de cada pão: Bola e Árabe. O preço do item é o
--      da opção escolhida (migração 049), não um acréscimo.
--   2. Sanduíches que já estavam cadastrados duplicados por pão (ex.: "Hambúrguer (Pão
--      Bola)", "Hambúrguer (Pão Árabe)") são desativados, não apagados, para não quebrar
--      pedidos antigos. Só mexe na categoria de sanduíche.
--
-- Requer a migração 049 aplicada. Pode ser rodado de novo sem duplicar nada.
--
-- Como usar (no console do Postgres):
--   Teste, sem gravar nada (mostra o que seria feito):
--     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f carga_sanduiches_sabores_da_pizza.sql
--   Aplicar de verdade:
--     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v aplicar=1 -f carga_sanduiches_sabores_da_pizza.sql

\set ON_ERROR_STOP on
begin;

do $carga$
declare
  v_est uuid;
  v_nome_est text;
  v_qtd int;
  v_cat uuid;
  v_item jsonb;
  v_prod uuid;
  v_grupo uuid;
  v_norm text;
  v_ordem int;
  v_desativados int := 0;
  v_total int := 0;
  v_menu jsonb := $json$
[
  {"n": "Hamburgue", "d": "Carne e salada", "bola": 8, "arabe": 9},
  {"n": "Americano", "d": "Presunto, ovo e queijo", "bola": 8, "arabe": 10},
  {"n": "Califórnia", "d": "Carne, ovo, presunto, queijo e salada", "bola": 13, "arabe": 15},
  {"n": "Frango", "d": "Frango, milho e salada", "bola": 10, "arabe": 12},
  {"n": "Frango c/ Catupiry", "d": "Frango, catupiry, milho, queijo e salada", "bola": 10, "arabe": 12},
  {"n": "X-Frango", "d": "Frango, queijo, milho e salada", "bola": 10, "arabe": 12},
  {"n": "X-Burgue", "d": "Carne, queijo e salada", "bola": 10, "arabe": 12},
  {"n": "X-Eggs", "d": "Carne, ovo, queijo e salada", "bola": 11, "arabe": 13},
  {"n": "X-Ovo", "d": "Ovo, queijo e salada", "bola": 8, "arabe": 10},
  {"n": "X-Bacon", "d": "Carne, bacon, queijo e salada", "bola": 12, "arabe": 14},
  {"n": "X-Presunto", "d": "Carne, queijo, presunto e salada", "bola": 10, "arabe": 12},
  {"n": "Sabores", "d": "Presunto, carne, calabresa, queijo, frango, ovo, salsicha, bacon, milho, catupiry, cheddar e salada", "bola": 18, "arabe": 20},
  {"n": "Queijo", "d": "Queijo", "bola": 8, "arabe": 11},
  {"n": "Misto", "d": "Presunto e queijo", "bola": 8, "arabe": 11},
  {"n": "Bauru", "d": "Carne, ovo, calabresa, queijo e salada", "bola": 13, "arabe": 15},
  {"n": "X-Tudo", "d": "Carne, presunto, bacon, calabresa, frango, ovo, queijo e salada", "bola": 15, "arabe": 17},
  {"n": "X-Calabresa", "d": "Pão, ovos, calabresa, queijo e salada", "bola": 10, "arabe": 12},
  {"n": "X-Carne de Sol", "d": "Pão, carne de sol, queijo e salada", "bola": 12, "arabe": 15},
  {"n": "Tradicional Carne Moída", "d": "Pão, carne moída, queijo e salada", "unico": 8}
]
$json$::jsonb;
begin
  select count(*) into v_qtd from estabelecimentos where nome ilike '%sabores%da%pizza%';
  if v_qtd <> 1 then
    raise exception 'Esperava 1 estabelecimento parecido com "Sabores da Pizza" e achei %.', v_qtd;
  end if;
  select id, nome into v_est, v_nome_est from estabelecimentos where nome ilike '%sabores%da%pizza%';
  perform set_config('app.estabelecimento_id', v_est::text, true);
  raise notice 'Estabelecimento: % (%)', v_nome_est, v_est;

  -- Categoria de sanduíche (a que a loja já tem, senão cria).
  select id into v_cat from categorias_produto
    where estabelecimento_id = v_est and nome ilike 'sandu%' order by nome limit 1;
  if v_cat is null then
    insert into categorias_produto (estabelecimento_id, nome, ordem_exibicao)
    values (v_est, 'Sanduíche', (select coalesce(max(ordem_exibicao), -1) + 1 from categorias_produto where estabelecimento_id = v_est))
    returning id into v_cat;
  end if;
  raise notice 'Categoria: %', (select nome from categorias_produto where id = v_cat);

  create temp table _cand (id uuid, nome text, exato boolean) on commit drop;

  for v_item in select * from jsonb_array_elements(v_menu) loop
    v_norm := regexp_replace(translate(lower(v_item->>'n'), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '\s*-\s*', '-', 'g');
    v_prod := null;

    -- Cadastros desta categoria que são o mesmo sanduíche (com ou sem sufixo de pão).
    delete from _cand;
    insert into _cand
    select p.id, p.nome,
           regexp_replace(translate(lower(p.nome), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '\s*-\s*', '-', 'g') = v_norm
    from produtos p
    where p.estabelecimento_id = v_est and p.categoria_id = v_cat and p.tipo_produto = 'padrao'
      and regexp_replace(regexp_replace(translate(lower(p.nome), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '\s*-\s*', '-', 'g'),
                         '\s*\(?\s*(pao\s+)?(bola|arabe)\s*\)?\s*$', '') = v_norm;

    select id into v_prod from _cand order by exato desc, nome limit 1;
    if v_prod is null then
      insert into produtos (estabelecimento_id, categoria_id, nome, modo_precificacao, preco_custo, margem_percentual, preco_venda)
      values (v_est, v_cat, v_item->>'n', 'preco_manual', 0, 0, 0)
      returning id into v_prod;
    end if;

    -- Os outros cadastros do mesmo sanduíche (um por pão) saem de cena.
    update produtos set ativo = false, updated_at = now()
    where id in (select id from _cand where id <> v_prod) and ativo;
    get diagnostics v_qtd = row_count;
    v_desativados := v_desativados + v_qtd;

    update produtos set
      nome = v_item->>'n', descricao = v_item->>'d', ativo = true, tamanho = null,
      modo_precificacao = 'preco_manual',
      preco_venda = coalesce((v_item->>'bola')::numeric, (v_item->>'unico')::numeric),
      updated_at = now()
    where id = v_prod;

    -- Recria a pergunta do pão.
    delete from produto_grupos_opcoes where produto_id = v_prod and translate(lower(nome), 'ã', 'a') like 'pao%';
    if v_item ? 'bola' then
      insert into produto_grupos_opcoes (estabelecimento_id, produto_id, nome, minimo_selecoes, maximo_selecoes, define_preco, ativo, ordem)
      values (v_est, v_prod, 'Escolha seu pão', 1, 1, true, true, 0)
      returning id into v_grupo;
      insert into produto_opcoes (estabelecimento_id, grupo_id, nome, acrescimo, ativo, ordem)
      values (v_est, v_grupo, 'Bola', (v_item->>'bola')::numeric, true, 0),
             (v_est, v_grupo, 'Árabe', (v_item->>'arabe')::numeric, true, 1);
    end if;
    v_total := v_total + 1;
  end loop;

  raise notice 'Sanduíches criados/atualizados: %', v_total;
  raise notice 'Cadastros antigos duplicados por pão DESATIVADOS: %', v_desativados;
  raise notice 'Outros produtos ativos na categoria (NÃO alterados, confira): %',
    (select coalesce(string_agg(nome, ', ' order by nome), 'nenhum') from produtos
      where estabelecimento_id = v_est and categoria_id = v_cat and ativo
        and nome not in (select x->>'n' from jsonb_array_elements(v_menu) x));
end
$carga$;

\if :{?aplicar}
  commit;
  \echo '>>> APLICADO.'
\else
  rollback;
  \echo '>>> TESTE: nada foi gravado. Para aplicar rode de novo com -v aplicar=1'
\endif
