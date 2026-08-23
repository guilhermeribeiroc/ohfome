"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock3, PauseCircle, Plus, Save, Trash2 } from "lucide-react";

type Turno = { inicio: string; fim: string };
type Horarios = { pausado: boolean; mensagemPausa: string; turnos: Record<string, Turno[]> };
const dias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const vazio: Horarios = { pausado: false, mensagemPausa: "Não estamos recebendo pedidos no momento.", turnos: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] } };

export default function HorariosPage() {
  const [dados, setDados] = useState<Horarios>(vazio);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    fetch("/api/estabelecimento/horarios").then(async (r) => {
      const corpo = await r.json().catch(() => null);
      if (!r.ok) throw new Error(corpo?.erro ?? "Não foi possível carregar os horários.");
      setDados(corpo);
    }).catch((erro: Error) => setMensagem(erro.message)).finally(() => setCarregando(false));
  }, []);

  function atualizarTurno(dia: string, indice: number, campo: keyof Turno, valor: string) {
    setDados((atual) => ({ ...atual, turnos: { ...atual.turnos, [dia]: atual.turnos[dia].map((turno, i) => i === indice ? { ...turno, [campo]: valor } : turno) } }));
  }
  function adicionar(dia: string) { setDados((atual) => ({ ...atual, turnos: { ...atual.turnos, [dia]: [...atual.turnos[dia], { inicio: "11:00", fim: "14:00" }] } })); }
  function remover(dia: string, indice: number) { setDados((atual) => ({ ...atual, turnos: { ...atual.turnos, [dia]: atual.turnos[dia].filter((_, i) => i !== indice) } })); }
  async function salvar() {
    setSalvando(true); setMensagem("");
    const resposta = await fetch("/api/estabelecimento/horarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    const corpo = await resposta.json().catch(() => null);
    setSalvando(false);
    if (!resposta.ok) return setMensagem(corpo?.erro ?? "Não foi possível salvar.");
    setDados(corpo); setMensagem("Horários de delivery salvos. O cardápio foi atualizado.");
  }
  if (carregando) return <div className="of-page"><div className="of-panel p-6 text-sm text-ink-500">Carregando horários…</div></div>;

  return <div className="of-page max-w-4xl">
    <Link href="/configuracoes" className="of-btn-secondary mb-5"><ArrowLeft size={16} /> Configurações</Link>
    <div className="of-page-header"><div><p className="of-eyebrow">Cardápio digital</p><h1 className="of-title">Horários de delivery</h1><p className="of-subtitle">Defina quando o cardápio recebe pedidos. Fora desses horários, os clientes veem que o delivery está fechado antes de adicionar itens.</p></div></div>
    <section className="of-panel overflow-hidden">
      <div className="flex items-start gap-4 border-b border-cream-200 p-5 sm:p-6"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral-050 text-coral-600"><PauseCircle size={22} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-semibold text-ink-900">Pausar delivery</h2><p className="mt-1 text-sm text-ink-500">Use em imprevistos. O cardápio continua visível, mas ninguém consegue adicionar ou finalizar pedidos.</p></div><button type="button" onClick={() => setDados((atual) => ({ ...atual, pausado: !atual.pausado }))} className={`relative h-8 w-14 rounded-full transition ${dados.pausado ? "bg-coral-500" : "bg-cream-300"}`} aria-pressed={dados.pausado}><i className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${dados.pausado ? "left-7" : "left-1"}`} /></button></div>
      {dados.pausado && <label className="mt-4 block text-sm font-semibold text-ink-700">Mensagem para o cliente<textarea value={dados.mensagemPausa} onChange={(e) => setDados((atual) => ({ ...atual, mensagemPausa: e.target.value }))} maxLength={280} rows={2} className="mt-2 w-full resize-none rounded-xl border border-cream-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-coral-400" /></label>}</div></div>
      <div className="p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><Clock3 size={18} className="text-coral-600" /><h2 className="font-display text-lg font-semibold text-ink-900">Funcionamento semanal do delivery</h2></div><div className="divide-y divide-cream-200">{dias.map((nome, numero) => { const dia = String(numero); const turnos = dados.turnos[dia] ?? []; return <div key={dia} className="py-4 first:pt-0 last:pb-0 sm:flex sm:items-start sm:gap-6"><div className="flex min-w-36 items-center justify-between gap-3"><b className="text-sm text-ink-800">{nome}</b><span className="text-xs text-ink-400 sm:hidden">{turnos.length ? `${turnos.length} turno(s)` : "Fechado"}</span></div><div className="mt-3 flex-1 sm:mt-0"><div className="space-y-2">{turnos.map((turno, indice) => <div key={`${dia}-${indice}`} className="flex items-center gap-2"><input type="time" value={turno.inicio} onChange={(e) => atualizarTurno(dia, indice, "inicio", e.target.value)} className="rounded-xl border border-cream-200 bg-white px-2 py-2 text-sm outline-none focus:border-coral-400" /><span className="text-xs text-ink-400">até</span><input type="time" value={turno.fim} onChange={(e) => atualizarTurno(dia, indice, "fim", e.target.value)} className="rounded-xl border border-cream-200 bg-white px-2 py-2 text-sm outline-none focus:border-coral-400" /><button type="button" onClick={() => remover(dia, indice)} className="of-icon-btn !h-9 !min-h-9 !w-9 text-coral-600" aria-label={`Remover turno de ${nome}`}><Trash2 size={15} /></button></div>)}</div><button type="button" onClick={() => adicionar(dia)} disabled={turnos.length >= 4} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-coral-600 disabled:opacity-40"><Plus size={15} /> Adicionar turno</button></div></div>; })}</div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 bg-cream-50/50 p-5 sm:px-6"><p role="status" className={`text-sm ${mensagem.includes("salvos") ? "text-basil-700" : "text-coral-600"}`}>{mensagem}</p><button onClick={salvar} disabled={salvando} className="of-btn-primary"><Save size={16} /> {salvando ? "Salvando…" : "Salvar horários de delivery"}</button></div>
    </section>
  </div>;
}
