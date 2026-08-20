-- Identifica a estação que está processando cada ticket e evita que outra
-- aba/computador confirme ou altere uma reserva que não lhe pertence.

alter table impressao_jobs
  add column if not exists estacao_id text,
  add column if not exists token_reserva uuid,
  add column if not exists ultimo_heartbeat_em timestamptz,
  add column if not exists concluido_em timestamptz;

create index if not exists idx_impressao_jobs_reserva_estacao
  on impressao_jobs(estabelecimento_id, estacao_id, status, ultimo_heartbeat_em)
  where status = 'imprimindo';

create index if not exists idx_impressao_jobs_falhos
  on impressao_jobs(estabelecimento_id, created_at desc)
  where status = 'falhou';
