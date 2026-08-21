"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, CreditCard, Link2, LoaderCircle, Save } from "lucide-react";

type ConfiguracaoPix = {
  ativo: boolean;
  modo: "manual" | "mercado_pago";
  chaveManual: string | null;
  instrucaoManual: string | null;
  expiracaoMinutos: number;
  mercadoPagoConectado: boolean;
  collectorId?: string | null;
};

export default function ConfiguracaoPagamentosPage() {
  const [dados, setDados] = useState<ConfiguracaoPix | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pagamentos/pix").then(async (resposta) => {
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível carregar pagamentos.");
      setDados(corpo);
    }).catch((causa) => setErro(causa instanceof Error ? causa.message : "Não foi possível carregar pagamentos."));
    const aviso = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mercadoPago") === "conectado") setMensagem("Conta Mercado Pago conectada com segurança.");
      if (params.get("mercadoPago") === "erro") setErro(params.get("mensagem") ?? "Não foi possível conectar o Mercado Pago.");
    }, 0);
    return () => window.clearTimeout(aviso);
  }, []);

  async function salvar() {
    if (!dados) return;
    setSalvando(true); setErro(null); setMensagem(null);
    try {
      const resposta = await fetch("/api/pagamentos/pix", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível salvar.");
      setDados((atual) => atual ? { ...atual, ...corpo } : atual);
      setMensagem("Configuração Pix salva.");
    } catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }

  if (!dados) return <div className="of-page"><Link href="/configuracoes" className="of-btn-secondary"><ArrowLeft size={16} /> Configurações</Link><div className="mt-6 of-panel p-6 text-sm text-ink-500">{erro ?? "Carregando pagamentos..."}</div></div>;

  return <div className="of-page pb-24">
    <Link href="/configuracoes" className="of-btn-secondary mb-5"><ArrowLeft size={16} /> Configurações</Link>
    <div className="of-page-header"><div><p className="of-eyebrow">Recebimentos</p><h1 className="of-title">Pix</h1><p className="of-subtitle">Escolha um único modo Pix para o cardápio digital.</p></div></div>
    {erro && <p className="mb-4 flex gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-700"><CircleAlert size={17} className="shrink-0" />{erro}</p>}
    {mensagem && <p className="mb-4 flex gap-2 rounded-xl bg-basil-050 p-3 text-sm text-basil-700"><CheckCircle2 size={17} className="shrink-0" />{mensagem}</p>}
    <section className="of-panel overflow-hidden">
      <div className="border-b border-cream-200 p-5 sm:p-6"><p className="text-base font-semibold text-ink-900">Disponibilidade no cardápio</p><p className="mt-1 text-sm text-ink-500">Desative enquanto ainda estiver configurando; o Pix não aparecerá ao cliente.</p><button onClick={() => setDados({ ...dados, ativo: !dados.ativo })} className={`mt-4 inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${dados.ativo ? "bg-basil-600 text-white" : "bg-cream-100 text-ink-600"}`}>{dados.ativo ? "Pix ativado" : "Pix desativado"}</button></div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
        <button type="button" onClick={() => setDados({ ...dados, modo: "manual" })} className={`rounded-2xl border p-5 text-left ${dados.modo === "manual" ? "border-coral-500 bg-coral-050 ring-1 ring-coral-200" : "border-cream-200"}`}><CreditCard size={20} className="text-coral-600" /><b className="mt-4 block text-ink-900">Pix na entrega</b><span className="mt-1 block text-sm leading-5 text-ink-500">Pedido vai para cozinha com pagamento pendente; a equipe confirma depois.</span></button>
        <button type="button" onClick={() => setDados({ ...dados, modo: "mercado_pago" })} className={`rounded-2xl border p-5 text-left ${dados.modo === "mercado_pago" ? "border-coral-500 bg-coral-050 ring-1 ring-coral-200" : "border-cream-200"}`}><Link2 size={20} className="text-coral-600" /><b className="mt-4 block text-ink-900">Pix automático</b><span className="mt-1 block text-sm leading-5 text-ink-500">Gera QR Code Mercado Pago e libera a cozinha somente após a confirmação.</span></button>
      </div>
      {dados.modo === "manual" ? <div className="border-t border-cream-200 p-5 sm:p-6"><label className="block text-sm font-semibold text-ink-700">Chave Pix (opcional)<input value={dados.chaveManual ?? ""} onChange={(e) => setDados({ ...dados, chaveManual: e.target.value })} placeholder="CPF, e-mail, telefone ou chave aleatória" className="mt-2 w-full rounded-xl border border-cream-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-coral-400" /></label><label className="mt-4 block text-sm font-semibold text-ink-700">Instrução para a entrega (opcional)<textarea value={dados.instrucaoManual ?? ""} onChange={(e) => setDados({ ...dados, instrucaoManual: e.target.value })} placeholder="Ex.: o entregador informa a chave no momento da entrega." rows={3} className="mt-2 w-full resize-none rounded-xl border border-cream-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-coral-400" /></label></div> : <div className="border-t border-cream-200 p-5 sm:p-6"><div className={`rounded-2xl p-4 ${dados.mercadoPagoConectado ? "bg-basil-050 text-basil-800" : "bg-cream-50 text-ink-600"}`}><b className="flex items-center gap-2">{dados.mercadoPagoConectado ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}{dados.mercadoPagoConectado ? "Conta Mercado Pago conectada" : "Conecte a conta que receberá os pagamentos"}</b><p className="mt-1 text-sm leading-5">O token fica protegido no servidor. O OhFome não recebe nem movimenta o dinheiro.</p></div>{!dados.mercadoPagoConectado ? <a href="/api/pagamentos/mercado-pago/conectar" className="of-btn-primary mt-4"><Link2 size={16} /> Conectar Mercado Pago</a> : <label className="mt-4 block text-sm font-semibold text-ink-700">Expiração do QR Code<input type="number" min={30} max={43200} value={dados.expiracaoMinutos} onChange={(e) => setDados({ ...dados, expiracaoMinutos: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-cream-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-coral-400" /><span className="mt-1 block text-xs font-normal text-ink-500">Mínimo de 30 minutos; máximo de 30 dias.</span></label>}</div>}
      <div className="flex justify-end border-t border-cream-200 bg-cream-50/60 p-5 sm:p-6"><button onClick={salvar} disabled={salvando} className="of-btn-primary">{salvando ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} Salvar configuração</button></div>
    </section>
  </div>;
}
