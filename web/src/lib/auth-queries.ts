import { comEstabelecimento } from "./db";
import type { ModuloSistema, PapelUsuario, TipoEstabelecimento } from "./tenant-types";

export interface ContextoSessao {
  estabelecimento: {
    id: string;
    nome: string;
    tipo: TipoEstabelecimento;
    tipoComida: string;
    slug: string;
    modulosAtivos: ModuloSistema[];
    onboardingConcluido: boolean;
  };
  usuario: {
    id: string;
    nome: string;
    usuario: string;
    role: PapelUsuario;
  };
}

export async function buscarContexto(estabelecimentoId: string, usuarioId: string): Promise<ContextoSessao | null> {
  return comEstabelecimento(estabelecimentoId, async (client) => {
    const { rows: estRows } = await client.query(
      `select id, nome, tipo, tipo_comida as "tipoComida", slug, onboarding_concluido as "onboardingConcluido" from estabelecimentos where id = $1 and ativo`,
      [estabelecimentoId]
    );
    if (estRows.length === 0) return null;

    const { rows: modRows } = await client.query(
      `select modulo from estabelecimento_modulos where estabelecimento_id = $1`,
      [estabelecimentoId]
    );

    const { rows: userRows } = await client.query(
      `select id, nome, usuario, role from usuarios where id = $1 and ativo`,
      [usuarioId]
    );
    if (userRows.length === 0) return null;

    return {
      estabelecimento: {
        ...estRows[0],
        modulosAtivos: modRows.map((r) => r.modulo as ModuloSistema),
      },
      usuario: userRows[0],
    };
  });
}
