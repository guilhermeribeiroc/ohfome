-- Exportacao somente-leitura dos "clientes" (administradores ativos, um por
-- estabelecimento) pro sistema de gestao externo do Guilherme, consumida
-- por GET /api/integracoes/gestao/clientes. A rota autentica via secret
-- (OHFOME_GESTAO_SYNC_SECRET) e chama esta funcao pelo pool publico/anonimo
-- (queryPublico) — por isso precisa ser SECURITY DEFINER: usuarios tem RLS
-- por estabelecimento, e essa integracao precisa enxergar todos os tenants,
-- mas so os campos abaixo (nunca senha_hash nem outras colunas sensiveis).
create function fn_integracao_gestao_clientes(
  p_limit integer,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid
)
returns table (
  id uuid,
  estabelecimento_id uuid,
  nome text,
  email text,
  telefone text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with admins as (
    -- distinct on garante no maximo um administrador por estabelecimento:
    -- o primeiro cadastrado (created_at mais antigo, id como desempate).
    select distinct on (u.estabelecimento_id)
      u.id, u.estabelecimento_id, u.nome, u.email, u.telefone, u.created_at, u.updated_at
    from usuarios u
    where u.role = 'admin' and u.ativo
    order by u.estabelecimento_id, u.created_at asc, u.id asc
  )
  select a.id, a.estabelecimento_id, a.nome, a.email, a.telefone, a.created_at, a.updated_at
  from admins a
  where p_cursor_created_at is null
     or (a.created_at, a.id) > (p_cursor_created_at, p_cursor_id)
  order by a.created_at asc, a.id asc
  limit p_limit;
$$;

revoke all on function fn_integracao_gestao_clientes(integer, timestamptz, uuid) from public;
grant execute on function fn_integracao_gestao_clientes(integer, timestamptz, uuid) to ohfome_app;
