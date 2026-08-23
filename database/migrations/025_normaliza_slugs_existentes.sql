-- Normaliza qualquer slug antigo que ainda tenha ficado no formato anterior
-- (com hífen e/ou sufixo aleatório, ex.: "doce-encanto-lvvr4t"). O app já
-- gera slugs limpos (so a-z0-9) desde a correção em web/src/lib/slug.ts;
-- isso aqui so limpa registros que foram criados antes dessa correção.
with alvo as (
  select id, regexp_replace(lower(unaccent(nome)), '[^a-z0-9]', '', 'g') as slug_limpo
  from estabelecimentos
)
update estabelecimentos e
set slug = a.slug_limpo
from alvo a
where e.id = a.id
  and e.slug <> a.slug_limpo
  and a.slug_limpo <> ''
  and not exists (
    select 1 from estabelecimentos existente
    where existente.slug = a.slug_limpo and existente.id <> a.id
  );
