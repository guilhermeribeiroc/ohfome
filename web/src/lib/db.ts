import { Pool, type PoolClient, types } from "pg";

// node-postgres devolve NUMERIC como string por padrao (evita perda de
// precisao em valores muito grandes). Aqui isso e so dinheiro em reais,
// entao converter pra number deixa o front-end consistente com os tipos
// declarados em lib/types.ts.
types.setTypeParser(1700, (valor) => parseFloat(valor));

function getPool(): Pool {
  const globalForPg = globalThis as unknown as { pgPool?: Pool };
  if (!globalForPg.pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL ausente. Defina em web/.env.local.");
    }
    globalForPg.pgPool = new Pool({ connectionString, max: 10 });
  }
  return globalForPg.pgPool;
}

// Para operacoes que nao dependem de um estabelecimento logado ainda
// (login, registro) — essas passam pelas funcoes SECURITY DEFINER do banco,
// que ja restringem o que pode ser lido/escrito.
export async function queryPublico<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const { rows } = await getPool().query(text, params);
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
  const client = await getPool().connect();
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
