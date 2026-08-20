-- Margem negativa representa preço de venda abaixo do custo e é permitida.
alter table produtos drop constraint if exists produtos_margem_percentual_check;

drop trigger if exists trg_produtos_precificacao on produtos;

alter table produtos
  alter column margem_percentual type numeric(7, 2);

alter table produtos
  add constraint produtos_margem_percentual_limite
  check (margem_percentual >= -100 and margem_percentual <= 99999.99);

create trigger trg_produtos_precificacao
  before insert or update of preco_custo, margem_percentual, preco_venda, modo_precificacao
  on produtos
  for each row execute function calcular_precificacao();
