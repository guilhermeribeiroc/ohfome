"use client";

import { useEffect } from "react";
import { CheckCircle2, ChevronRight, Download, MonitorCog, Printer, ShieldCheck } from "lucide-react";

export default function ConfiguracaoImpressaoPage() {
  useEffect(() => {
    window.dispatchEvent(new Event("ohfome:abrir-configuracao-impressao"));
  }, []);

  function abrirPainel() {
    window.dispatchEvent(new Event("ohfome:abrir-configuracao-impressao"));
  }

  return <div className="of-page pb-28">
    <div className="of-page-header">
      <div>
        <p className="of-eyebrow">Estação do balcão</p>
        <h1 className="of-title">Impressão</h1>
        <p className="of-subtitle">Configure este computador uma única vez. Depois, os pedidos imprimem em qualquer tela do OhFome.</p>
      </div>
      <button onClick={abrirPainel} className="of-btn-primary w-full sm:w-auto"><Printer size={17} /> Configurar estação</button>
    </div>

    <section className="mb-5 overflow-hidden rounded-[1.6rem] border border-ink-900 bg-ink-900 p-6 text-white shadow-[0_24px_60px_-38px_rgba(25,23,20,.7)] sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-white/75"><MonitorCog size={14} className="text-coral-300" /> Estação persistente</span>
          <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold tracking-[-.05em]">A impressão não depende mais da tela Cozinha.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Mantenha qualquer página autenticada do OhFome aberta nesta máquina. Se o QZ Tray cair, a estação tenta reconectar e os pedidos permanecem guardados na fila.</p>
        </div>
        <button onClick={abrirPainel} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-coral-500 px-4 text-sm font-semibold text-white transition hover:bg-coral-400 active:scale-[.98]"><Printer size={17} /> Abrir painel da estação <ChevronRight size={16} /></button>
      </div>
    </section>

    <section className="of-panel overflow-hidden">
      <div className="border-b border-cream-200 px-5 py-4 sm:px-6"><p className="text-sm font-semibold text-ink-900">Guia de instalação</p><p className="mt-1 text-xs leading-5 text-ink-500">Siga nesta ordem no computador que ficará conectado à impressora.</p></div>
      <ol className="divide-y divide-cream-200">
        {[
          { icon: Download, titulo: "Instale e abra o QZ Tray", descricao: "Use o instalador indicado para Windows ou macOS. O ícone do QZ deve aparecer perto do relógio do computador." },
          { icon: ShieldCheck, titulo: "Autorize o OhFome nesta estação", descricao: "Durante as primeiras instalações, o responsável configura o certificado próprio do OhFome. Nunca copie a chave privada para este computador." },
          { icon: Printer, titulo: "Selecione a impressora e faça o teste", descricao: "Abra o painel acima, escolha a fila instalada, informe 58 mm ou 80 mm e imprima uma comanda de teste." },
          { icon: CheckCircle2, titulo: "Ative a impressão automática", descricao: "Com a estação conectada, todos os pedidos de cardápio, balcão, delivery e garçom entram automaticamente na mesma fila." },
        ].map(({ icon: Icone, titulo, descricao }, indice) => <li key={titulo} className="flex gap-4 px-5 py-5 sm:px-6"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral-050 text-coral-600 ring-1 ring-coral-100"><Icone size={17} /></span><div><p className="text-sm font-semibold text-ink-900"><span className="mr-2 text-ink-400">0{indice + 1}</span>{titulo}</p><p className="mt-1 text-xs leading-5 text-ink-500">{descricao}</p></div></li>)}
      </ol>
    </section>
  </div>;
}
