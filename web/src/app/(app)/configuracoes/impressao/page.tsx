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
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="of-btn-secondary justify-center"><Download size={17} /> Baixar QZ Tray</a><button onClick={abrirPainel} className="of-btn-primary"><Printer size={17} /> Configurar estação</button></div>
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
          { icon: Download, titulo: "Instale e abra o QZ Tray", descricao: "Baixe o instalador oficial para Windows ou macOS. Depois de instalar, confirme que o ícone do QZ aparece perto do relógio do computador.", link: { href: "https://qz.io/download/", label: "Abrir download oficial" } },
          { icon: ShieldCheck, titulo: "Instale a confiança do OhFome", descricao: "Baixe o certificado raiz público e siga o guia entregue pelo implantador. Ele autoriza somente as comandas assinadas pelo OhFome; a chave privada nunca vai para o computador do cliente.", link: { href: "/ohfome-qz-root-ca.crt", label: "Baixar certificado OhFome", download: true } },
          { icon: Printer, titulo: "Instale o driver e faça o teste", descricao: "Adicione a impressora no Windows ou macOS e faça uma página de teste pelo sistema operacional. Depois, abra o painel acima, escolha a fila, informe 58 mm ou 80 mm e imprima uma comanda." },
          { icon: CheckCircle2, titulo: "Ative a estação", descricao: "Ative a impressão automática e mantenha o QZ Tray e uma aba autenticada do OhFome abertos. Cardápio, balcão, delivery e garçom entram na mesma fila." },
        ].map(({ icon: Icone, titulo, descricao, link }, indice) => <li key={titulo} className="flex gap-4 px-5 py-5 sm:px-6"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral-050 text-coral-600 ring-1 ring-coral-100"><Icone size={17} /></span><div><p className="text-sm font-semibold text-ink-900"><span className="mr-2 text-ink-400">0{indice + 1}</span>{titulo}</p><p className="mt-1 text-xs leading-5 text-ink-500">{descricao}</p>{link && <a href={link.href} target={link.download ? undefined : "_blank"} rel={link.download ? undefined : "noreferrer"} download={link.download} className="mt-2 inline-flex text-xs font-semibold text-coral-600 hover:text-coral-700">{link.label} <ChevronRight size={14} /></a>}</div></li>)}
      </ol>
    </section>
  </div>;
}
