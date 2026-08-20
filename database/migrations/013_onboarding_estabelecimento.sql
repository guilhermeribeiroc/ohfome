-- Controla se o fluxo de boas-vindas (convidar equipe + configurar
-- estoque/precificacao) ja foi mostrado/dispensado pelo administrador.
alter table estabelecimentos
  add column if not exists onboarding_concluido boolean not null default false;
