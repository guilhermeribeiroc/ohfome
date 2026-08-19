-- Cardápio Digital inclui o controle operacional de Delivery.
insert into estabelecimento_modulos (estabelecimento_id, modulo)
select estabelecimento_id, 'delivery'::modulo_sistema
from estabelecimento_modulos
where modulo = 'site'
on conflict (estabelecimento_id, modulo) do nothing;
