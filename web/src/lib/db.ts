import { Pool, type PoolClient, types } from "pg";

// node-postgres devolve NUMERIC como string por padrao (evita perda de
// precisao em valores muito grandes). Aqui isso e so dinheiro em reais,
// entao converter pra number deixa o front-end consistente com os tipos
// declarados em lib/types.ts.
types.setTypeParser(1700, (valor) => parseFloat(valor));

function conexao() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ausente. Defina em web/.env.local.");
  }
  return connectionString;
}

// Duas pools separadas de propósito: o cardápio público (sem login, exposto
// a qualquer cliente final, incluindo picos de acesso simultâneo) usa uma
// pool própria e menor. Assim, mesmo que muita gente acesse o cardápio ao
// mesmo tempo, isso nunca consome as conexões que o Balcão/Cozinha/Garçom
// precisam pra continuar respondendo rápido pra equipe.
function getPoolInterna(): Pool {
  const globalForPg = globalThis as unknown as { pgPoolInterna?: Pool };
  if (!globalForPg.pgPoolInterna) {
    globalForPg.pgPoolInterna = new Pool({ connectionString: conexao(), max: 15, statement_timeout: 15000 });
  }
  return globalForPg.pgPoolInterna;
}

function getPoolPublica(): Pool {
  const globalForPg = globalThis as unknown as { pgPoolPublica?: Pool };
  if (!globalForPg.pgPoolPublica) {
    globalForPg.pgPoolPublica = new Pool({ connectionString: conexao(), max: 10, statement_timeout: 8000 });
  }
  return globalForPg.pgPoolPublica;
}

// Para operacoes que nao dependem de um estabelecimento logado ainda
// (login, registro, cardapio publico) — essas passam pelas funcoes SECURITY
// DEFINER do banco, que ja restringem o que pode ser lido/escrito.
export async function queryPublico<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const { rows } = await getPoolPublica().query(text, params);
  return rows as T[];
}

// Toda query feita em nome de um estabelecimento autenticado passa por aqui:
// abre uma transacao, define app.estabelecimento_id via SET LOCAL (visivel
// so nessa transacao) e so entao roda o callback. A Row Level Security do
// Postgres usa essa variavel de sessao para nunca deixar passar dados de
// outro estabelecimento, mesmo que o callback erre a query.
export async function comEstabelecimento<T>(
  estabelecimentoId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPoolInterna().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.estabelecimento_id', $1, true)", [estabelecimentoId]);
    const resultado = await callback(client);
    await client.query("commit");
    return resultado;
  } catch (erro) {
    await client.query("rollback");
    throw erro;
  } finally {
    client.release();
  }
}
