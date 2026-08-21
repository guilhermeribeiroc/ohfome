-- Slugs públicos usam somente letras e números, sem hífen ou código aleatório.
-- Corrige o cadastro existente do Milleto Restaurante quando o endereço livre
-- ainda não estiver em uso por outro estabelecimento.

with milleto as (
  select id
  from estabelecimentos
  where regexp_replace(lower(unaccent(nome)), '[^a-z0-9]', '', 'g') = 'milletorestaurante'
  order by created_at asc
  limit 1
)
update estabelecimentos e
set slug = 'milletorestaurante'
from milleto m
where e.id = m.id
  and e.slug <> 'milletorestaurante'
  and not exists (
    select 1
    from estabelecimentos existente
    where existente.slug = 'milletorestaurante'
      and existente.id <> m.id
  );
