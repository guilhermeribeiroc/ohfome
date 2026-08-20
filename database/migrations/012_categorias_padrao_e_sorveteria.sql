-- Adiciona o segmento Sorveteria e passa a semear categorias de produto
-- padrao (nichadas pelo tipo do estabelecimento) na hora do cadastro.

alter type tipo_estabelecimento add value if not exists 'sorveteria';

-- PostgreSQL nao permite renomear parametros em CREATE OR REPLACE FUNCTION,
-- mas aqui so estamos adicionando um passo novo ao final do corpo (semear
-- categorias padrao), entao create or replace basta.
create or replace function fn_registrar_estabelecimento(
  p_nome text,
  p_tipo tipo_estabelecimento,
  p_tipo_comida text,
  p_modulos modulo_sistema[],
  p_usuarios jsonb,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estabelecimento_id uuid;
  v_modulo modulo_sistema;
  v_usuario jsonb;
  v_categorias text[];
  v_nome_categoria text;
  v_ordem int;
begin
  insert into estabelecimentos (nome, tipo, tipo_comida, slug)
  values (p_nome, p_tipo, p_tipo_comida, p_slug)
  returning id into v_estabelecimento_id;

  foreach v_modulo in array p_modulos loop
    insert into estabelecimento_modulos (estabelecimento_id, modulo)
    values (v_estabelecimento_id, v_modulo);
  end loop;

  for v_usuario in select jsonb_array_elements(p_usuarios) loop
    insert into usuarios (estabelecimento_id, nome, usuario, email, senha_hash, role)
    values (
      v_estabelecimento_id,
      v_usuario->>'nome',
      lower(v_usuario->>'usuario'),
      nullif(lower(v_usuario->>'email'), ''),
      v_usuario->>'senha_hash',
      (v_usuario->>'role')::user_role
    );
  end loop;

  -- Categorias de produto padrao, nichadas pelo tipo do estabelecimento —
  -- poupa o cliente de comecar do zero e ja da uma referencia do que
  -- cadastrar no Cardapio Digital / Estoque.
  v_categorias := case p_tipo
    when 'churrascaria' then array['Espetos', 'Carnes', 'Porções', 'Acompanhamentos', 'Saladas', 'Bebidas', 'Sobremesas']
    when 'pizzaria' then array['Pizzas Salgadas', 'Pizzas Doces', 'Esfihas', 'Bebidas', 'Sobremesas']
    when 'hamburgueria' then array['Hambúrgueres', 'Porções', 'Combos', 'Bebidas', 'Sobremesas']
    when 'japonesa' then array['Sushis', 'Temakis', 'Yakisoba', 'Entradas', 'Bebidas', 'Sobremesas']
    when 'padaria_cafeteria' then array['Pães', 'Salgados', 'Doces', 'Cafés', 'Bebidas']
    when 'sorveteria' then array['Sorvetes', 'Açaí', 'Milkshakes', 'Sundaes', 'Casquinhas', 'Bebidas']
    else array['Entradas', 'Pratos Principais', 'Acompanhamentos', 'Bebidas', 'Sobremesas']
  end;

  v_ordem := 0;
  foreach v_nome_categoria in array v_categorias loop
    insert into categorias_produto (estabelecimento_id, nome, ordem_exibicao)
    values (v_estabelecimento_id, v_nome_categoria, v_ordem);
    v_ordem := v_ordem + 1;
  end loop;

  return v_estabelecimento_id;
end;
$$;
