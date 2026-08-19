-- Login por usuario e gestao de equipe.
-- Contas antigas preservam o e-mail como identificador de transicao.

alter table usuarios add column if not exists usuario text;

update usuarios
set usuario = lower(email)
where usuario is null;

alter table usuarios alter column usuario set not null;
create unique index if not exists uq_usuarios_usuario on usuarios(usuario);
alter table usuarios alter column email drop not null;

-- PostgreSQL não permite renomear parâmetros em CREATE OR REPLACE FUNCTION.
-- A função não possui dependências por OID, então a recriamos com o novo
-- identificador de acesso antes de publicar a versão por usuário.
drop function if exists fn_autenticar(text);

create or replace function fn_autenticar(p_usuario text)
returns table (
  usuario_id uuid,
  estabelecimento_id uuid,
  nome text,
  senha_hash text,
  role user_role,
  usuario_ativo boolean,
  estabelecimento_ativo boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.estabelecimento_id, u.nome, u.senha_hash, u.role, u.ativo, e.ativo
  from usuarios u
  join estabelecimentos e on e.id = u.estabelecimento_id
  where u.usuario = lower(p_usuario)
     or u.email = lower(p_usuario);
$$;

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

  return v_estabelecimento_id;
end;
$$;
