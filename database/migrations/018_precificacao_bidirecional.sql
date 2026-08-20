-- Margem negativa representa preço de venda abaixo do custo e é permitida.
alter table produtos drop constraint if exists produtos_margem_percentual_check;

alter table produtos
  alter column margem_percentual type numeric(7, 2);

alter table produtos
  add constraint produtos_margem_percentual_limite
  check (margem_percentual >= -100 and margem_percentual <= 99999.99);
