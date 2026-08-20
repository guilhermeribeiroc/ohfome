-- A migration 014 semeia os bairros ao criar restaurantes novos. Esta etapa
-- completa a mesma lista para os estabelecimentos de delivery que já existiam
-- antes do recurso, sempre desativada até o administrador informar as taxas.
insert into bairros_entrega (estabelecimento_id, nome)
select estabelecimento.id, bairro.nome
from estabelecimentos estabelecimento
join estabelecimento_modulos modulo
  on modulo.estabelecimento_id = estabelecimento.id
 and modulo.modulo = 'delivery'
cross join unnest(array[
  'Centro', 'Cristo Rei', 'São José', 'Hermógenes Henrique Girão',
  'Nossa Senhora da Conceição', 'Girão Maia', 'Júlia Santiago', 'São Francisco',
  'Antônio Raulino', 'Divino Espírito Santo', 'Alto Tiradentes',
  'Dionísio de Matos Fontes', 'Dois de Agosto', 'Luiz Valter Rabelo Maia', 'Irapuan Nobre'
]::text[]) as bairro(nome)
on conflict (estabelecimento_id, nome) do nothing;
