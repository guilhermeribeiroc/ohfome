import { createCipheriv, randomBytes } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

function obrigatorio(nome) {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`${nome} é obrigatório.`);
  return valor;
}

function cifrar(valor, chaveBase64) {
  const chave = Buffer.from(chaveBase64, "base64");
  if (chave.length !== 32) throw new Error("MERCADO_PAGO_TOKEN_ENCRYPTION_KEY deve conter 32 bytes em Base64.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const conteudo = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${conteudo.toString("base64url")}`;
}

async function main() {
  const databaseUrl = obrigatorio("DATABASE_URL");
  const estabelecimentoId = obrigatorio("OHFOME_DEMO_ESTABELECIMENTO_ID");
  const token = obrigatorio("OHFOME_DEMO_MP_TEST_ACCESS_TOKEN");
  const chave = obrigatorio("MERCADO_PAGO_TOKEN_ENCRYPTION_KEY");
  if (token.length < 20) throw new Error("OHFOME_DEMO_MP_TEST_ACCESS_TOKEN parece inválido.");

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.estabelecimento_id', $1, true)", [estabelecimentoId]);
    const { rows } = await client.query(
      `select id, slug, demonstracao
         from estabelecimentos
        where id = $1
        for update`,
      [estabelecimentoId],
    );
    const demo = rows[0];
    if (!demo || demo.slug !== "restauranteteste" || demo.demonstracao !== true) {
      throw new Error("O estabelecimento informado não é a conta demonstrativa restauranteteste.");
    }

    await client.query(
      `insert into mercado_pago_conexoes
        (estabelecimento_id, collector_id, access_token_cifrado, refresh_token_cifrado, token_expira_em, scope, ambiente)
       values ($1, 'demo-teste', $2, null, null, 'test', 'teste')
       on conflict (estabelecimento_id) do update
         set collector_id = excluded.collector_id,
             access_token_cifrado = excluded.access_token_cifrado,
             refresh_token_cifrado = null,
             token_expira_em = null,
             scope = excluded.scope,
             ambiente = excluded.ambiente,
             conectado_em = now()`,
      [estabelecimentoId, cifrar(token, chave)],
    );
    await client.query(
      `insert into configuracoes_pix (estabelecimento_id, ativo, modo, expiracao_minutos)
       values ($1, true, 'mercado_pago', 30)
       on conflict (estabelecimento_id) do update
         set ativo = true, modo = 'mercado_pago', expiracao_minutos = 30`,
      [estabelecimentoId],
    );
    await client.query("commit");
    console.log("Credencial de teste Mercado Pago provisionada para a conta demonstrativa.");
  } catch (erro) {
    await client.query("rollback").catch(() => undefined);
    console.error(erro instanceof Error ? erro.message : "Não foi possível provisionar a credencial de teste.");
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
