"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, CalendarPlus, CircleDollarSign, Minus, Plus, ReceiptText, Search, Trash2, Truck, UtensilsCrossed, WalletCards, X, type LucideIcon } from "lucide-react";
import type { CustoFixo, FinanceiroTipo, MovimentoFinanceiro, Produto, ResumoFinanceiro, VendaFinanceira } from "@/lib/types";
import { nomeProdutoComTamanho } from "@/lib/types";
import { mascararMoeda, moedaComCentavos, numeroDaMoeda } from "@/lib/moeda";
import { usePolling } from "@/lib/use-polling";

type DadosFinanceiros = { movimentos: MovimentoFinanceiro[]; custosFixos: CustoFixo[]; vendasFinalizadas: VendaFinanceira[]; resumo: ResumoFinanceiro; resumoHoje: ResumoFinanceiro; hoje: string };
type PedidoAntigo = { id: string; codigo: number; tipo: "mesa" | "balcao" | "delivery"; total: number; createdAt: string; mesaNumero?: number; clienteNome?: string };
type PendentesAntigos = { pedidos: PedidoAntigo[]; total: number };
type Aba = "movimento" | "custo_fixo";
type PeriodoFinanceiro = "dia" | "semana" | "mes" | "personalizado";
type Intervalo = { inicio: string; fim: string };

function dataLocal(data = new Date()) {
  const deslocamento = data.getTimezoneOffset() * 60_000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 10);
}

const hoje = dataLocal();
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function adicionarDias(data: string, quantidade: number) {
  const resultado = new Date(`${data}T12:00:00`);
  resultado.setDate(resultado.getDate() + quantidade);
  return dataLocal(resultado);
}

function ultimoDiaDoMes(data: string) {
  const [ano, mes] = data.split("-").map(Number);
  return dataLocal(new Date(ano, mes, 0, 12));
}

function intervaloPadrao(periodo: Exclude<PeriodoFinanceiro, "personalizado">): Intervalo {
  if (periodo === "dia") return { inicio: hoje, fim: hoje };
  if (periodo === "mes") return { inicio: `${hoje.slice(0, 7)}-01`, fim: ultimoDiaDoMes(hoje) };
  const diaDaSemana = new Date(`${hoje}T12:00:00`).getDay();
  const diasDesdeSegunda = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  const inicio = adicionarDias(hoje, -diasDesdeSegunda);
  return { inicio, fim: adicionarDias(inicio, 6) };
}

function dataBrasileira(valor: string): string {
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : "Data não informada";
}

// createdAt vem como timestamptz em UTC: cortar os 10 primeiros caracteres
// (como dataBrasileira faz) da o dia errado sempre que o horario local em
// Fortaleza (UTC-3) ja passou da meia-noite em UTC. Por isso aqui converte
// pro fuso do estabelecimento antes de formatar.
function dataHoraBrasileira(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "Data não informada";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(data);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")}/${parte("year")} às ${parte("hour")}:${parte("minute")}`;
}

async function jsonSeguro(resposta: Response): Promise<{ erro?: string; [chave: string]: unknown } | null> {
  const corpo = await resposta.text();
  if (!corpo) return null;
  try { return JSON.parse(corpo) as { erro?: string; [chave: string]: unknown }; }
  catch { return null; }
}

export function FinanceiroModule() {
  const [aba, setAba] = useState<Aba>("movimento");
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoFinanceiro>("mes");
  const [intervalo, setIntervalo] = useState<Intervalo>(() => intervaloPadrao("mes"));
  const [inicioPersonalizado, setInicioPersonalizado] = useState(intervalo.inicio);
  const [fimPersonalizado, setFimPersonalizado] = useState(intervalo.fim);
  const [erroPeriodo, setErroPeriodo] = useState("");
  const [vendaRetroativaAberta, setVendaRetroativaAberta] = useState(false);
  const [tipo, setTipo] = useState<FinanceiroTipo>("saida");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [vencimento, setVencimento] = useState("10");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const urlFinanceiro = useMemo(() => `/api/financeiro?${new URLSearchParams(intervalo).toString()}`, [intervalo]);
  const { dados, carregando, erro: erroCarregamento, recarregar } = usePolling<DadosFinanceiros>(urlFinanceiro, 15_000);
  const resumo = useMemo(() => dados?.resumo ?? { vendasFinalizadas: 0, custoProdutosVendidos: 0, entradasAvulsas: 0, saidasAvulsas: 0, custosFixosPeriodo: 0, resultadoOperacional: 0 }, [dados]);
  const resumoHoje = useMemo(() => dados?.resumoHoje ?? { vendasFinalizadas: 0, custoProdutosVendidos: 0, entradasAvulsas: 0, saidasAvulsas: 0, custosFixosPeriodo: 0, resultadoOperacional: 0 }, [dados]);
  const vendasPresencial = useMemo(() => (dados?.vendasFinalizadas ?? []).filter((venda) => venda.tipo !== "delivery"), [dados]);
  const vendasDelivery = useMemo(() => (dados?.vendasFinalizadas ?? []).filter((venda) => venda.tipo === "delivery"), [dados]);
  const { dados: pendentesAntigos, recarregar: recarregarPendentes } = usePolling<PendentesAntigos>("/api/financeiro/pendentes", 30_000);
  const [fechandoPendentes, setFechandoPendentes] = useState(false);

  function selecionarPeriodo(periodo: PeriodoFinanceiro) {
    setPeriodoSelecionado(periodo);
    if (periodo === "personalizado") return;
    setErroPeriodo("");
    const proximoIntervalo = intervaloPadrao(periodo);
    setIntervalo(proximoIntervalo);
    setInicioPersonalizado(proximoIntervalo.inicio);
    setFimPersonalizado(proximoIntervalo.fim);
  }

  function aplicarPeriodoPersonalizado() {
    const quantidadeDeDias = inicioPersonalizado && fimPersonalizado
      ? (new Date(`${fimPersonalizado}T12:00:00`).getTime() - new Date(`${inicioPersonalizado}T12:00:00`).getTime()) / 86_400_000
      : Number.POSITIVE_INFINITY;
    if (!inicioPersonalizado || !fimPersonalizado || inicioPersonalizado > fimPersonalizado || quantidadeDeDias > 366) {
      setErroPeriodo("Informe um período válido de até 12 meses.");
      return;
    }
    setErroPeriodo("");
    setIntervalo({ inicio: inicioPersonalizado, fim: fimPersonalizado });
  }

  function limparFormulario() {
    setCategoria(""); setDescricao(""); setValor(""); setData(hoje); setVencimento("10"); setErro("");
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    const valorNumerico = numeroDaMoeda(valor);
    if (!categoria.trim() || !descricao.trim() || valorNumerico <= 0) { setErro("Informe categoria, descrição e valor."); return; }
    setSalvando(true);
    try {
      const resposta = await fetch("/api/financeiro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipoRegistro: aba, tipo, categoria, descricao, valor: valorNumerico, dataMovimento: data, diaVencimento: Number(vencimento) }) });
      const retorno = await jsonSeguro(resposta);
      if (!resposta.ok) throw new Error(retorno?.erro ?? "Não foi possível salvar este registro. Tente novamente.");
      limparFormulario();
      await recarregar();
    } catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível salvar este registro."); }
    finally { setSalvando(false); }
  }

  async function excluir(id: string, tipoRegistro: Aba) {
    if (!confirm("Remover este registro financeiro?")) return;
    const resposta = await fetch("/api/financeiro", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, tipoRegistro }) });
    if (resposta.ok) await recarregar();
  }

  async function excluirVenda(venda: VendaFinanceira) {
    if (!confirm(`Excluir a venda do pedido #${venda.codigo}? O pedido finalizado será removido permanentemente.`)) return;
    const resposta = await fetch(`/api/pedidos/${venda.id}`, { method: "DELETE" });
    if (resposta.ok) { await recarregar(); return; }
    const retorno = await jsonSeguro(resposta);
    alert(retorno?.erro ?? "Não foi possível excluir esta venda.");
  }

  async function fecharPendentesAntigos() {
    const quantidade = pendentesAntigos?.pedidos.length ?? 0;
    if (!quantidade) return;
    if (!confirm(`Fechar ${quantidade} pedido${quantidade === 1 ? "" : "s"} de dias anteriores ainda em aberto? Eles serão finalizados e contabilizados no financeiro do dia em que foram criados, e as mesas correspondentes serão liberadas.`)) return;
    setFechandoPendentes(true);
    const resposta = await fetch("/api/financeiro/pendentes", { method: "POST" });
    setFechandoPendentes(false);
    if (!resposta.ok) {
      const retorno = await jsonSeguro(resposta);
      alert(retorno?.erro ?? "Não foi possível fechar os pedidos antigos.");
      return;
    }
    await Promise.all([recarregarPendentes(), recarregar()]);
  }

  const margemOperacional = resumo.vendasFinalizadas > 0 ? (resumo.resultadoOperacional / resumo.vendasFinalizadas) * 100 : null;

  return <div className="of-page">
    <header className="of-page-header"><div><p className="of-eyebrow">Gestão administrativa</p><h1 className="of-title">Financeiro</h1><p className="of-subtitle">Entradas, saídas, custos fixos e resultado da operação no período selecionado.</p>
      <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Escolha o período financeiro">
        {([ ["dia", "Hoje"], ["semana", "Esta semana"], ["mes", "Este mês"], ["personalizado", "Personalizado"] ] as const).map(([periodo, rotulo]) => <button key={periodo} type="button" onClick={() => selecionarPeriodo(periodo)} data-active={periodoSelecionado === periodo} className="rounded-xl border border-cream-200 bg-white px-3 py-2 text-xs font-semibold text-ink-500 transition data-[active=true]:border-ink-900 data-[active=true]:bg-ink-900 data-[active=true]:text-white">{rotulo}</button>)}
      </div>
      {periodoSelecionado === "personalizado" && <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-cream-200 bg-white/70 p-3"><Campo label="De"><input type="date" value={inicioPersonalizado} onChange={(evento) => setInicioPersonalizado(evento.target.value)} className="of-field !min-h-10" /></Campo><Campo label="Até"><input type="date" value={fimPersonalizado} onChange={(evento) => setFimPersonalizado(evento.target.value)} className="of-field !min-h-10" /></Campo><button type="button" onClick={aplicarPeriodoPersonalizado} className="of-primary-btn !min-h-10 px-4 text-xs">Aplicar</button></div>}
      <p className="mt-3 text-xs font-medium text-ink-400">Exibindo de {dataBrasileira(intervalo.inicio)} até {dataBrasileira(intervalo.fim)}.</p>
      {erroPeriodo && <p className="mt-2 text-xs font-medium text-coral-600">{erroPeriodo}</p>}
      {erroCarregamento && <p className="mt-3 text-xs font-medium text-coral-600">{erroCarregamento}</p>}
    </div>
      <button onClick={() => setVendaRetroativaAberta(true)} className="of-btn-secondary w-full sm:w-auto"><CalendarPlus size={16} /> Lançar venda de outro dia</button>
    </header>

    {!!pendentesAntigos?.pedidos.length && (
      <section className="of-panel mb-5 overflow-hidden border-mango-400/50 bg-mango-500/10">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mango-500/15 text-mango-500"><AlertTriangle size={19} /></span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-ink-900">Pedidos de dias anteriores ainda em aberto</h2>
              <p className="mt-0.5 text-xs leading-5 text-ink-500">{pendentesAntigos.pedidos.length} pedido{pendentesAntigos.pedidos.length === 1 ? "" : "s"} totalizando {moeda(pendentesAntigos.total)} — provavelmente mesa ou comanda esquecida aberta virando o dia. Feche pra contar no financeiro do dia certo.</p>
            </div>
          </div>
          <button onClick={() => void fecharPendentesAntigos()} disabled={fechandoPendentes} className="of-primary-btn !min-h-11 shrink-0 px-4 text-xs">{fechandoPendentes ? "Fechando..." : "Fechar tudo agora"}</button>
        </div>
        <ul className="divide-y divide-mango-400/20 border-t border-mango-400/20 px-5">
          {pendentesAntigos.pedidos.map((pedido) => (
            <li key={pedido.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
              <span className="min-w-0 truncate text-ink-600">Pedido #{pedido.codigo} · {pedido.mesaNumero ? `Mesa ${pedido.mesaNumero}` : pedido.clienteNome || (pedido.tipo === "delivery" ? "Delivery" : "Central de pedidos")} · {dataHoraBrasileira(pedido.createdAt)}</span>
              <strong className="shrink-0 text-ink-900">{moeda(pedido.total)}</strong>
            </li>
          ))}
        </ul>
      </section>
    )}

    <section className="of-panel overflow-hidden !border-ink-900/10 !bg-ink-900"><div className="flex items-center gap-3 border-b border-white/10 px-5 py-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-mango-400"><CalendarDays size={19} /></span><div><h2 className="font-display text-lg font-bold tracking-tight text-white">Financeiro de hoje</h2><p className="mt-0.5 text-xs text-white/50">Resumo de {dataBrasileira(dados?.hoje ?? hoje)}, independente do período selecionado acima.</p></div></div>
      <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
        <ResumoMini label="Vendas de hoje" valor={resumoHoje.vendasFinalizadas} />
        <ResumoMini label="Custo dos produtos" valor={resumoHoje.custoProdutosVendidos} />
        <ResumoMini label="Saídas e custos fixos" valor={resumoHoje.saidasAvulsas + resumoHoje.custosFixosPeriodo} />
        <ResumoMini label="Resultado de hoje" valor={resumoHoje.resultadoOperacional} destaque={resumoHoje.resultadoOperacional >= 0 ? "basil" : "coral"} />
      </div>
    </section>

    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ResumoCard label="Vendas finalizadas" valor={resumo.vendasFinalizadas} icon={ArrowUpRight} tom="basil" />
      <ResumoCard label="Custo dos produtos" valor={resumo.custoProdutosVendidos} icon={ReceiptText} tom="amber" />
      <ResumoCard label="Saídas e custos fixos" valor={resumo.saidasAvulsas + resumo.custosFixosPeriodo} icon={ArrowDownRight} tom="coral" />
      <ResumoCard label="Resultado operacional" valor={resumo.resultadoOperacional} icon={WalletCards} tom={resumo.resultadoOperacional >= 0 ? "basil" : "coral"} destaque descricao={margemOperacional === null ? "Aguardando vendas finalizadas" : `${margemOperacional >= 0 ? "Margem operacional" : "Margem negativa"} de ${Math.abs(margemOperacional).toFixed(1).replace(".", ",")}%`} />
    </section>

    <section className="mt-5">
      <div className="mb-3"><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Vendas finalizadas</h2><p className="mt-0.5 text-xs text-ink-400">Receita, custo dos produtos e lucro bruto de cada pedido concluído no período, separadas por canal.</p></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <PainelVendas titulo="Mesa & Balcão" icon={UtensilsCrossed} tom="basil" vendas={vendasPresencial} carregando={carregando} onExcluir={excluirVenda} textoVazio="Nenhuma venda de mesa ou balcão finalizada neste período." />
        <PainelVendas titulo="Delivery" icon={Truck} tom="coral" vendas={vendasDelivery} carregando={carregando} onExcluir={excluirVenda} textoVazio="Nenhuma venda delivery finalizada neste período." />
      </div>
    </section>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="of-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4"><div><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Lançamentos</h2><p className="mt-0.5 text-xs text-ink-400">Registre qualquer movimentação do caixa.</p></div><CircleDollarSign size={21} className="text-coral-500" /></div>
        <div className="max-h-[440px] divide-y divide-cream-200 overflow-y-auto">
          {carregando ? <LinhasCarregando /> : dados?.movimentos.length ? dados.movimentos.map((movimento) => <div key={movimento.id} className="flex items-center gap-3 px-5 py-4"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${movimento.tipo === "entrada" ? "bg-basil-050 text-basil-600" : "bg-coral-050 text-coral-600"}`}>{movimento.tipo === "entrada" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{movimento.descricao}</p><p className="mt-0.5 text-xs text-ink-400">{movimento.categoria} · {dataBrasileira(movimento.dataMovimento)}</p></div><strong className={movimento.tipo === "entrada" ? "text-sm text-basil-600" : "text-sm text-coral-600"}>{movimento.tipo === "entrada" ? "+" : "−"}{moeda(movimento.valor)}</strong><button onClick={() => excluir(movimento.id, "movimento")} className="of-icon-btn !h-9 !min-h-9 !w-9 text-ink-400 hover:!text-coral-600" aria-label={`Excluir ${movimento.descricao}`}><Trash2 size={15} /></button></div>) : <Vazio texto="Nenhum lançamento avulso neste período." />}
        </div>
      </section>

      <aside className="of-panel p-5 sm:p-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-white"><Plus size={19} /></span><div><h2 className="font-display text-xl font-bold tracking-tight">Novo registro</h2><p className="text-xs text-ink-400">Atualiza seus indicadores na hora.</p></div></div>
        <div className="of-tabs mt-5"><button onClick={() => { setAba("movimento"); setErro(""); }} data-active={aba === "movimento"} className="of-tab">Entrada ou saída</button><button onClick={() => { setAba("custo_fixo"); setErro(""); }} data-active={aba === "custo_fixo"} className="of-tab">Custo fixo</button></div>
        <form onSubmit={salvar} className="mt-5 space-y-4">
          {aba === "movimento" && <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setTipo("entrada")} className={`min-h-11 rounded-xl border text-sm font-semibold transition ${tipo === "entrada" ? "border-basil-400 bg-basil-050 text-basil-700" : "border-cream-200 text-ink-500"}`}>Entrada</button><button type="button" onClick={() => setTipo("saida")} className={`min-h-11 rounded-xl border text-sm font-semibold transition ${tipo === "saida" ? "border-coral-300 bg-coral-050 text-coral-700" : "border-cream-200 text-ink-500"}`}>Saída</button></div>}
          <Campo label="Categoria"><input value={categoria} onChange={(e) => setCategoria(e.target.value)} className="of-field" placeholder={aba === "custo_fixo" ? "Ex.: Aluguel" : "Ex.: Compra de estoque"} /></Campo>
          <Campo label="Descrição"><input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="of-field" placeholder="Descreva este lançamento" /></Campo>
          <Campo label={aba === "custo_fixo" ? "Valor mensal" : "Valor"}><div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-400">R$</span><input value={valor} inputMode="decimal" onChange={(e) => setValor(mascararMoeda(e.target.value))} onBlur={() => valor && setValor(moedaComCentavos(valor))} className="of-field !pl-11" placeholder="0,00" /></div></Campo>
          {aba === "movimento" ? <Campo label="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} className="of-field" /></Campo> : <Campo label="Dia de vencimento"><div className="relative"><CalendarDays size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" /><input type="number" min="1" max="31" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="of-field !pl-11" /></div></Campo>}
          {erro && <p className="rounded-xl bg-coral-050 px-3 py-2 text-xs font-medium text-coral-700">{erro}</p>}
          <button disabled={salvando} className="of-primary-btn w-full">{salvando ? "Salvando..." : aba === "custo_fixo" ? "Adicionar custo fixo" : "Salvar lançamento"}</button>
        </form>
      </aside>
    </div>

    <section className="of-panel mt-5 overflow-hidden"><div className="flex items-center justify-between border-b border-cream-200 px-5 py-4"><div><h2 className="font-display text-xl font-bold tracking-tight">Custos fixos</h2><p className="mt-0.5 text-xs text-ink-400">Compromissos recorrentes rateados no período selecionado.</p></div><strong className="text-sm text-coral-600">{moeda(resumo.custosFixosPeriodo)} no período</strong></div><div className="divide-y divide-cream-200">{carregando ? <LinhasCarregando /> : dados?.custosFixos.length ? dados.custosFixos.map((custo) => <div key={custo.id} className="flex items-center gap-3 px-5 py-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mango-500/10 text-mango-500"><CalendarDays size={18} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{custo.descricao}</p><p className="mt-0.5 text-xs text-ink-400">{custo.categoria} · vence dia {custo.diaVencimento}</p></div><strong className="text-sm text-ink-900">{moeda(custo.valorMensal)}/mês</strong><button onClick={() => excluir(custo.id, "custo_fixo")} className="of-icon-btn !h-9 !min-h-9 !w-9 text-ink-400 hover:!text-coral-600" aria-label={`Excluir ${custo.descricao}`}><Trash2 size={15} /></button></div>) : <Vazio texto="Nenhum custo fixo cadastrado." />}</div></section>

    {vendaRetroativaAberta && (
      <LancarVendaRetroativaModal
        onFechar={() => setVendaRetroativaAberta(false)}
        onLancada={() => { setVendaRetroativaAberta(false); recarregar(); }}
      />
    )}
  </div>;
}

function Campo({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">{label}</span>{children}</label>; }
function Vazio({ texto }: { texto: string }) { return <p className="px-5 py-10 text-center text-sm text-ink-400">{texto}</p>; }
function LinhasCarregando() { return <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <i key={item} className="of-skeleton block h-14 rounded-xl" />)}</div>; }
function ResumoCard({ label, valor, icon: Icon, tom, destaque = false, descricao }: { label: string; valor: number; icon: LucideIcon; tom: "basil" | "amber" | "coral"; destaque?: boolean; descricao?: string }) { const cores = { basil: "bg-basil-050 text-basil-600", amber: "bg-mango-500/10 text-mango-500", coral: "bg-coral-050 text-coral-600" }; return <article className={`of-panel p-4 sm:p-5 ${destaque ? "!border-ink-900 !bg-ink-900 text-white" : ""}`}><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${destaque ? "bg-white/10 text-coral-400" : cores[tom]}`}><Icon size={18} /></span><p className={`mt-4 text-[11px] font-semibold uppercase tracking-[.12em] ${destaque ? "text-white/50" : "text-ink-400"}`}>{label}</p><strong className={`mt-1 block font-display text-2xl font-bold tracking-tight ${destaque ? "text-white" : "text-ink-900"}`}>{moeda(valor)}</strong>{descricao && <p className={`mt-2 text-xs font-medium ${destaque ? "text-basil-400" : "text-ink-400"}`}>{descricao}</p>}</article>; }
function ResumoMini({ label, valor, destaque }: { label: string; valor: number; destaque?: "basil" | "coral" }) { return <div className="bg-ink-900 p-4 sm:p-5"><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-white/50">{label}</p><strong className={`mt-1 block font-display text-xl font-bold tracking-tight ${destaque === "coral" ? "text-coral-400" : destaque === "basil" ? "text-basil-400" : "text-white"}`}>{moeda(valor)}</strong></div>; }

function PainelVendas({ titulo, icon: Icon, tom, vendas, carregando, onExcluir, textoVazio }: { titulo: string; icon: LucideIcon; tom: "basil" | "coral"; vendas: VendaFinanceira[]; carregando: boolean; onExcluir: (venda: VendaFinanceira) => void; textoVazio: string }) {
  const subtotal = useMemo(() => vendas.reduce((soma, venda) => soma + venda.total, 0), [vendas]);
  const cores = tom === "basil" ? "bg-basil-050 text-basil-600" : "bg-coral-050 text-coral-600";
  return <section className="of-panel overflow-hidden">
    <div className="flex items-center justify-between gap-3 border-b border-cream-200 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cores}`}><Icon size={19} /></span><div className="min-w-0"><h3 className="font-display text-base font-bold tracking-tight text-ink-900">{titulo}</h3><p className="mt-0.5 text-xs text-ink-400">{vendas.length} {vendas.length === 1 ? "venda" : "vendas"}</p></div></div>
      <strong className="shrink-0 font-display text-base font-bold text-ink-900">{moeda(subtotal)}</strong>
    </div>
    <div className="max-h-[380px] divide-y divide-cream-200 overflow-y-auto">{carregando ? <LinhasCarregando /> : vendas.length ? vendas.map((venda) => <VendaFinalizadaLinha key={venda.id} venda={venda} onExcluir={onExcluir} />) : <Vazio texto={textoVazio} />}</div>
  </section>;
}

function VendaFinalizadaLinha({ venda, onExcluir }: { venda: VendaFinanceira; onExcluir: (venda: VendaFinanceira) => void }) {
  const identificacao = venda.mesaNumero ? `Mesa ${venda.mesaNumero}` : venda.clienteNome || (venda.tipo === "delivery" ? "Delivery" : "Central de pedidos");
  return <details className="group px-5 py-4"><summary className="flex cursor-pointer list-none items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-basil-050 text-basil-600"><ReceiptText size={18} /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-sm font-semibold text-ink-900">Pedido #{venda.codigo}</p><span className="truncate text-xs text-ink-400">{identificacao}</span></div><p className="mt-0.5 text-xs text-ink-400">Finalizado em {dataHoraBrasileira(venda.createdAt)}</p></div><div className="text-right"><strong className="block text-sm text-ink-900">{moeda(venda.total)}</strong><span className={`text-xs font-semibold ${venda.lucroBruto >= 0 ? "text-basil-600" : "text-coral-600"}`}>Lucro {moeda(venda.lucroBruto)}</span></div><button onClick={(evento) => { evento.preventDefault(); evento.stopPropagation(); onExcluir(venda); }} className="of-icon-btn !h-9 !min-h-9 !w-9 shrink-0 text-ink-400 hover:!text-coral-600" aria-label={`Excluir venda do pedido ${venda.codigo}`}><Trash2 size={15} /></button></summary><div className="mt-4 rounded-2xl border border-cream-200 bg-cream-50/70 p-3.5"><div className="grid grid-cols-2 gap-2 border-b border-cream-200 pb-3 text-xs"><div><p className="text-ink-400">Venda</p><strong className="mt-1 block text-ink-900">{moeda(venda.total)}</strong></div><div><p className="text-ink-400">Custo dos produtos</p><strong className="mt-1 block text-mango-500">{moeda(venda.custoProdutos)}</strong></div></div><ul className="mt-3 space-y-2">{venda.itens.map((item, indice) => <li key={`${item.produtoNome}-${indice}`} className="flex items-start justify-between gap-4 text-xs"><span className="text-ink-600"><b className="mr-1.5 text-ink-900">{item.quantidade}×</b>{item.produtoNome}</span><span className="shrink-0 text-right text-ink-500">Venda {moeda(item.precoUnitario * item.quantidade)}<br />Custo {moeda(item.custoUnitario * item.quantidade)}</span></li>)}</ul></div></details>;
}

function LancarVendaRetroativaModal({ onFechar, onLancada }: { onFechar: () => void; onLancada: () => void }) {
  const { dados: produtos } = usePolling<Produto[]>("/api/produtos", 60_000);
  const [data, setData] = useState(() => adicionarDias(hoje, -1));
  const [tipo, setTipo] = useState<"balcao" | "delivery">("balcao");
  const [clienteNome, setClienteNome] = useState("");
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<Record<string, number>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const produtosFiltrados = useMemo(
    () => (produtos ?? []).map((produto) => ({ ...produto, nomeExibicao: nomeProdutoComTamanho(produto) })).filter((produto) => produto.nomeExibicao.toLowerCase().includes(busca.toLowerCase())),
    [produtos, busca]
  );
  const totalItens = useMemo(() => Object.values(itens).reduce((soma, qtd) => soma + qtd, 0), [itens]);
  const total = useMemo(
    () => Object.entries(itens).reduce((soma, [id, qtd]) => soma + ((produtos ?? []).find((produto) => produto.id === id)?.precoVenda ?? 0) * qtd, 0),
    [itens, produtos]
  );

  function ajustar(produtoId: string, delta: number) {
    setItens((atual) => {
      const novaQtd = (atual[produtoId] ?? 0) + delta;
      if (novaQtd <= 0) return Object.fromEntries(Object.entries(atual).filter(([chave]) => chave !== produtoId));
      return { ...atual, [produtoId]: novaQtd };
    });
  }

  async function lancar() {
    setErro("");
    if (Object.keys(itens).length === 0) { setErro("Selecione ao menos um item vendido."); return; }
    if (tipo === "delivery" && !clienteNome.trim()) { setErro("Informe o nome do cliente."); return; }
    setEnviando(true);
    const resposta = await fetch("/api/financeiro/venda-retroativa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data,
        tipo,
        clienteNome: clienteNome.trim() || undefined,
        itens: Object.entries(itens).map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
      }),
    });
    setEnviando(false);
    if (!resposta.ok) {
      const retorno = await jsonSeguro(resposta);
      setErro(retorno?.erro ?? "Não foi possível lançar essa venda.");
      return;
    }
    onLancada();
  }

  return (
    <div className="of-modal-backdrop z-50" role="dialog" aria-modal="true" aria-label="Lançar venda de outro dia">
      <div className="of-modal-panel flex max-h-[90dvh] max-w-lg flex-col overflow-hidden">
        <header className="flex items-start justify-between border-b border-cream-200 p-5">
          <div>
            <p className="of-eyebrow">Financeiro</p>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink-900">Lançar venda de outro dia</h2>
            <p className="mt-1 text-xs leading-5 text-ink-400">Pra vendas que aconteceram mas não foram lançadas no sistema na hora. Escolha os itens como num pedido normal — o total já entra no financeiro do dia certo.</p>
          </div>
          <button onClick={onFechar} className="of-icon-btn shrink-0" aria-label="Fechar"><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Campo label="Data da venda"><input type="date" value={data} max={hoje} onChange={(evento) => setData(evento.target.value)} className="of-field !min-h-11" /></Campo>
            <Campo label="Canal">
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => setTipo("balcao")} className={`min-h-11 rounded-xl border text-xs font-semibold transition ${tipo === "balcao" ? "border-basil-400 bg-basil-050 text-basil-700" : "border-cream-200 text-ink-500"}`}>Mesa/Balcão</button>
                <button type="button" onClick={() => setTipo("delivery")} className={`min-h-11 rounded-xl border text-xs font-semibold transition ${tipo === "delivery" ? "border-coral-300 bg-coral-050 text-coral-700" : "border-cream-200 text-ink-500"}`}>Delivery</button>
              </div>
            </Campo>
          </div>

          {tipo === "delivery" && <div className="mb-4"><Campo label="Nome do cliente"><input value={clienteNome} onChange={(evento) => setClienteNome(evento.target.value)} placeholder="Nome do cliente" className="of-field" /></Campo></div>}

          <div className="relative mb-3"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar item do cardápio" className="of-field !pl-10" /></div>

          <div className="space-y-2">
            {!(produtos ?? []).length ? (
              <p className="py-8 text-center text-xs text-ink-400">Nenhum produto cadastrado.</p>
            ) : !produtosFiltrados.length ? (
              <p className="py-8 text-center text-xs text-ink-400">Nenhum item encontrado.</p>
            ) : (
              produtosFiltrados.map((produto) => {
                const qtd = itens[produto.id] ?? 0;
                return (
                  <div key={produto.id} className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition ${qtd > 0 ? "border-coral-200 bg-coral-050/60" : "border-cream-200 bg-cream-50"}`}>
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-ink-900">{produto.nomeExibicao}</p><p className="text-xs text-ink-400">{moeda(produto.precoVenda)}</p></div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => ajustar(produto.id, -1)} disabled={qtd === 0} className="of-icon-btn !h-9 !min-h-9 !w-9 disabled:opacity-30" aria-label={`Remover ${produto.nomeExibicao}`}><Minus size={14} /></button>
                      <span className="w-5 text-center text-sm font-bold text-ink-900">{qtd}</span>
                      <button onClick={() => ajustar(produto.id, 1)} className="of-icon-btn !h-9 !min-h-9 !w-9 !border-ink-900 !bg-ink-900 !text-white" aria-label={`Adicionar ${produto.nomeExibicao}`}><Plus size={14} /></button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <footer className="border-t border-cream-200 bg-surface p-5">
          <div className="mb-3 flex items-center justify-between"><span className="text-xs text-ink-400">{totalItens} item(ns)</span><strong className="font-display text-lg font-bold text-ink-900">{moeda(total)}</strong></div>
          {erro && <p className="mb-2 rounded-xl bg-coral-050 px-3 py-2 text-xs font-medium text-coral-700">{erro}</p>}
          <button onClick={() => void lancar()} disabled={enviando || Object.keys(itens).length === 0} className="of-primary-btn w-full">{enviando ? "Lançando..." : "Lançar venda"}</button>
        </footer>
      </div>
    </div>
  );
}
