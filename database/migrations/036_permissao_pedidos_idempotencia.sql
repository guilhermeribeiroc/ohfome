-- A tabela foi criada na migration 033 com RLS, mas faltou conceder acesso
-- para a role da aplicação. A policy tenant_isolation continua limitando cada
-- operação ao estabelecimento da sessão.
grant select, insert, update, delete on pedidos_idempotencia to ohfome_app;
