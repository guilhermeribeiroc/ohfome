import { comEstabelecimento } from "./db";
import type { ModuloSistema, PapelUsuario, TipoEstabelecimento } from "./tenant-types";

export interface ContextoSessao {
  estabelecimento: {
    id: string;
    nome: string;
    tipo: TipoEstabelecimento;
    tipoComida: string;
    slug: string;
    demonstracao: boolean;
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
    // Uma unica query com LEFT JOIN + agregação no lugar de 3 round-trips
    // sequenciais — isso roda em toda requisição autenticada do sistema
    // (inclusive cada tick de polling), então o custo por round-trip conta.
    const { rows } = await client.query(
      `select e.id, e.nome, e.tipo, e.tipo_comida as "tipoComida", e.slug, e.demonstracao,
              e.onboarding_concluido as "onboardingConcluido",
              coalesce(
                array_agg(em.modulo::text) filter (where em.modulo is not null),
                array[]::text[]
              ) as "modulosAtivos",
              u.id as "usuarioId", u.nome as "usuarioNome", u.usuario as "usuarioUsuario", u.role as "usuarioRole"
         from estabelecimentos e
         left join estabelecimento_modulos em on em.estabelecimento_id = e.id
         left join usuarios u on u.id = $2 and u.ativo
        where e.id = $1 and e.ativo
        group by e.id, u.id, u.nome, u.usuario, u.role`,
      [estabelecimentoId, usuarioId]
    );
    const linha = rows[0];
    if (!linha || !linha.usuarioId) return null;

    return {
      estabelecimento: {
        id: linha.id,
        nome: linha.nome,
        tipo: linha.tipo,
        tipoComida: linha.tipoComida,
        slug: linha.slug,
        demonstracao: linha.demonstracao,
        onboardingConcluido: linha.onboardingConcluido,
        modulosAtivos: linha.modulosAtivos as ModuloSistema[],
      },
      usuario: {
        id: linha.usuarioId,
        nome: linha.usuarioNome,
        usuario: linha.usuarioUsuario,
        role: linha.usuarioRole,
      },
    };
  });
}
