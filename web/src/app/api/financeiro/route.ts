import { NextResponse, type NextRequest } from "next/server";
import { autenticarRequisicao, respostaNaoAutenticado } from "@/lib/api-auth";
import { comEstabelecimento } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";

const TIPOS = ["entrada", "saida"] as const;
type Tipo = (typeof TIPOS)[number];
type Periodo = { inicio: string; fim: string };

function numero(valor: unknown) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : NaN;
}

function dataNaZonaAtual() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

function ultimoDiaDoMes(data: string) {
  const [ano, mes] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

function dataValida(data: string | null): data is string {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const dataConvertida = new Date(`${data}T12:00:00Z`);
  return !Number.isNaN(dataConvertida.getTime()) && dataConvertida.toISOString().slice(0, 10) === data;
}

function periodoDaRequisicao(request: NextRequest): Periodo | null {
  const inicio = request.nextUrl.searchParams.get("inicio");
  const fim = request.nextUrl.searchParams.get("fim");
  if (!inicio && !fim) {
    const hoje = dataNaZonaAtual();
    return { inicio: `${hoje.slice(0, 7)}-01`, fim: ultimoDiaDoMes(hoje) };
  }
  if (!dataValida(inicio) || !dataValida(fim) || inicio > fim) return null;

  const diferencaEmDias = (new Date(`${fim}T12:00:00Z`).getTime() - new Date(`${inicio}T12:00:00Z`).getTime()) / 86_400_000;
  return diferencaEmDias <= 366 ? { inicio, fim } : null;
}

async function administradorDaRequisicao(request: NextRequest): Promise<SessionPayload | null> {
  const sessao = autenticarRequisicao(request);
  if (!sessao) return null;
  const admin = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const { rows } = await client.query("select role from usuarios where id = $1", [sessao.usuarioId]);
    return rows[0]?.role === "admin";
  });
  return admin ? sessao : null;
}

function respostaSemPermissao() {
  return NextResponse.json({ erro: "Apenas administradores podem acessar o financeiro." }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const autenticado = autenticarRequisicao(request);
  if (!autenticado) return respostaNaoAutenticado();
  const sessao = await administradorDaRequisicao(request);
  if (!sessao) return respostaSemPermissao();
  const periodo = periodoDaRequisicao(request);
  if (!periodo) return NextResponse.json({ erro: "Selecione um período válido de até 12 meses." }, { status: 400 });

  const dados = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    const [movimentos, custosFixos, resumo, vendasFinalizadas] = await Promise.all([
      client.query(`select id, tipo, categoria, descricao, valor, data_movimento as "dataMovimento"
        from movimentacoes_financeiras
        where data_movimento between $1::date and $2::date
        order by data_movimento desc, created_at desc limit 80`, [periodo.inicio, periodo.fim]),
      client.query(`select id, categoria, descricao, valor_mensal as "valorMensal", dia_vencimento as "diaVencimento", ativo
        from custos_fixos order by ativo desc, dia_vencimento, descricao`),
      client.query(`with vendas as (
          select coalesce(sum(total), 0) as vendas
          from pedidos
          where status = 'finalizado'
            and (created_at at time zone 'America/Fortaleza')::date between $1::date and $2::date
        ), custo_vendido as (
          select coalesce(sum(i.quantidade * coalesce(pr.preco_custo, 0)), 0) as custo
          from itens_pedido i
          join pedidos p on p.id = i.pedido_id
          left join produtos pr on pr.id = i.produto_id
          where p.status = 'finalizado'
            and (p.created_at at time zone 'America/Fortaleza')::date between $1::date and $2::date
        ), avulsos as (
          select coalesce(sum(valor) filter (where tipo = 'entrada'), 0) as entradas,
                 coalesce(sum(valor) filter (where tipo = 'saida'), 0) as saidas
          from movimentacoes_financeiras
          where data_movimento between $1::date and $2::date
        ), fixos as (
          select coalesce(sum(cf.valor_mensal / extract(day from (date_trunc('month', dias.dia) + interval '1 month - 1 day'))), 0) as total
          from custos_fixos cf
          cross join generate_series($1::date, $2::date, interval '1 day') as dias(dia)
          where cf.ativo
        ) select vendas.vendas as "vendasFinalizadas", custo_vendido.custo as "custoProdutosVendidos",
                 avulsos.entradas as "entradasAvulsas", avulsos.saidas as "saidasAvulsas",
                 fixos.total as "custosFixosPeriodo"
        from vendas cross join custo_vendido cross join avulsos cross join fixos`, [periodo.inicio, periodo.fim]),
      client.query(`select
          p.id, p.codigo, p.tipo, p.total, p.created_at as "createdAt",
          m.numero as "mesaNumero", c.nome as "clienteNome",
          coalesce(sum(ip.quantidade * coalesce(pr.preco_custo, 0)), 0) as "custoProdutos",
          coalesce(json_agg(json_build_object(
            'produtoNome', pr.nome || case when ip.tamanho is not null then ' (' || ip.tamanho::text || ')' else '' end,
            'produtoTamanho', ip.tamanho,
            'quantidade', ip.quantidade,
            'precoUnitario', ip.preco_unitario,
            'custoUnitario', coalesce(pr.preco_custo, 0)
          ) order by ip.created_at) filter (where ip.id is not null), '[]') as itens
        from pedidos p
        left join comandas cm on cm.id = p.comanda_id
        left join mesas m on m.id = cm.mesa_id
        left join clientes c on c.id = p.cliente_id
        left join itens_pedido ip on ip.pedido_id = p.id
        left join produtos pr on pr.id = ip.produto_id
        where p.status = 'finalizado'
          and (p.created_at at time zone 'America/Fortaleza')::date between $1::date and $2::date
        group by p.id, p.codigo, p.tipo, p.total, p.created_at, m.numero, c.nome
        order by p.created_at desc
        limit 80`, [periodo.inicio, periodo.fim]),
    ]);
    return { movimentos: movimentos.rows, custosFixos: custosFixos.rows, resumo: resumo.rows[0], vendasFinalizadas: vendasFinalizadas.rows };
  });

  const resumo = dados.resumo;
  const resumoNormalizado = {
    vendasFinalizadas: Number(resumo.vendasFinalizadas),
    custoProdutosVendidos: Number(resumo.custoProdutosVendidos),
    entradasAvulsas: Number(resumo.entradasAvulsas),
    saidasAvulsas: Number(resumo.saidasAvulsas),
    custosFixosPeriodo: Number(resumo.custosFixosPeriodo),
  };
  return NextResponse.json({
    ...dados,
    periodo,
    vendasFinalizadas: dados.vendasFinalizadas.map((venda) => ({
      ...venda,
      custoProdutos: Number(venda.custoProdutos),
      lucroBruto: Number(venda.total) - Number(venda.custoProdutos),
    })),
    resumo: {
      ...resumoNormalizado,
      resultadoOperacional: resumoNormalizado.vendasFinalizadas - resumoNormalizado.custoProdutosVendidos + resumoNormalizado.entradasAvulsas - resumoNormalizado.saidasAvulsas - resumoNormalizado.custosFixosPeriodo,
    },
  });
}

export async function POST(request: NextRequest) {
  const autenticado = autenticarRequisicao(request);
  if (!autenticado) return respostaNaoAutenticado();
  const sessao = await administradorDaRequisicao(request);
  if (!sessao) return respostaSemPermissao();
  const body = await request.json().catch(() => null);
  const tipoRegistro = body?.tipoRegistro === "custo_fixo" ? "custo_fixo" : "movimento";
  const categoria = typeof body?.categoria === "string" ? body.categoria.trim() : "";
  const descricao = typeof body?.descricao === "string" ? body.descricao.trim() : "";
  const valor = numero(body?.valor);

  if (!categoria || !descricao || !Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ erro: "Preencha categoria, descrição e um valor maior que zero." }, { status: 400 });
  }

  const registro = await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    if (tipoRegistro === "custo_fixo") {
      const vencimento = Math.round(numero(body?.diaVencimento));
      if (!Number.isInteger(vencimento) || vencimento < 1 || vencimento > 31) throw new Error("Informe um vencimento entre 1 e 31.");
      const { rows } = await client.query(`insert into custos_fixos (estabelecimento_id, categoria, descricao, valor_mensal, dia_vencimento)
        values ($1, $2, $3, $4, $5)
        returning id, categoria, descricao, valor_mensal as "valorMensal", dia_vencimento as "diaVencimento", ativo`,
      [sessao.estabelecimentoId, categoria, descricao, valor, vencimento]);
      return rows[0];
    }

    const tipo = body?.tipo as Tipo;
    const data = typeof body?.dataMovimento === "string" ? body.dataMovimento : new Date().toISOString().slice(0, 10);
    if (!TIPOS.includes(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Movimento financeiro inválido.");
    const { rows } = await client.query(`insert into movimentacoes_financeiras (estabelecimento_id, tipo, categoria, descricao, valor, data_movimento, usuario_id)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, tipo, categoria, descricao, valor, data_movimento as "dataMovimento"`,
    [sessao.estabelecimentoId, tipo, categoria, descricao, valor, data, sessao.usuarioId]);
    return rows[0];
  });
  return NextResponse.json(registro, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const autenticado = autenticarRequisicao(request);
  if (!autenticado) return respostaNaoAutenticado();
  const sessao = await administradorDaRequisicao(request);
  if (!sessao) return respostaSemPermissao();
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const tipoRegistro = body?.tipoRegistro === "custo_fixo" ? "custo_fixo" : "movimento";
  if (!id) return NextResponse.json({ erro: "Registro inválido." }, { status: 400 });

  await comEstabelecimento(sessao.estabelecimentoId, async (client) => {
    await client.query(`delete from ${tipoRegistro === "custo_fixo" ? "custos_fixos" : "movimentacoes_financeiras"} where id = $1`, [id]);
  });
  return NextResponse.json({ ok: true });
}
