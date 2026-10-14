begin;

-- Pizzarias costumam vender também esfiha, sanduíche e hambúrguer — o
-- conjunto padrão de categorias sugerido no cadastro de um novo
-- estabelecimento tipo "pizzaria" passa a incluir Sanduíches e Hambúrgueres
-- (Esfihas já existia).
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
  v_bairros text[] := array[
    'Centro', 'Cristo Rei', 'São José', 'Hermógenes Henrique Girão',
    'Nossa Senhora da Conceição', 'Girão Maia', 'Júlia Santiago', 'São Francisco',
    'Antônio Raulino', 'Divino Espírito Santo', 'Alto Tiradentes',
    'Dionísio de Matos Fontes', 'Dois de Agosto', 'Luiz Valter Rabelo Maia', 'Irapuan Nobre'
  ];
  v_nome_bairro text;
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
    when 'pizzaria' then array['Pizzas Salgadas', 'Pizzas Doces', 'Esfihas', 'Sanduíches', 'Hambúrgueres', 'Bebidas', 'Sobremesas']
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

  foreach v_nome_bairro in array v_bairros loop
    insert into bairros_entrega (estabelecimento_id, nome)
    values (v_estabelecimento_id, v_nome_bairro);
  end loop;

  return v_estabelecimento_id;
end;
$$;

-- Pizzarias já cadastradas não passam de novo por esse seed — adiciona
-- Hambúrgueres (e Esfihas/Sanduíches, se faltarem) nas que ainda não têm.
-- O "padrao_like" cobre variações comuns (singular/plural, com/sem acento)
-- pra não duplicar uma categoria que o dono já criou manualmente.
insert into categorias_produto (estabelecimento_id, nome, ordem_exibicao)
select e.id, falta.nome,
  row_number() over (partition by e.id order by falta.nome)
    + coalesce((select max(ordem_exibicao) + 1 from categorias_produto where estabelecimento_id = e.id), 0) - 1
from estabelecimentos e
cross join (values
  ('Esfihas', '%esfiha%'),
  ('Sanduíches', '%sandu%'),
  ('Hambúrgueres', '%hamb%')
) as falta(nome, padrao_like)
where e.tipo = 'pizzaria'
  and not exists (
    select 1 from categorias_produto c
    where c.estabelecimento_id = e.id and c.nome ilike falta.padrao_like
  );

commit;
