"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, CircleHelp, Download, Laptop, MonitorCog, Printer, ShieldCheck, Wifi } from "lucide-react";

type Sistema = "windows" | "macos";

const SISTEMA_STORAGE_KEY = "ohfome.qz.configuracao.sistema";
const MODELO_STORAGE_KEY = "ohfome.qz.configuracao.modelo";

type Driver = { href: string; titulo: string; descricao: string };
type Modelo = {
  id: string;
  nome: string;
  fabricante: string;
  largura: "58 mm" | "80 mm";
  descricao: string;
  conexao: string;
  drivers: Record<Sistema, Driver>;
};

const MODELOS: Modelo[] = [
  {
    id: "oasis-pos58", nome: "Oasis OIA-8387 / POS-58", fabricante: "Oasis / POS-58", largura: "58 mm",
    descricao: "Modelo térmico de 58 mm compatível com o perfil POS-58.", conexao: "USB; também pode aparecer como Printer POS-58.",
    drivers: {
      windows: { href: "https://www.alarmshop.com.br/manuais/pos58/driver_windows.exe", titulo: "Baixar driver POS-58 para Windows", descricao: "Instale, selecione POS-58 e faça o teste de página no Windows." },
      macos: { href: "https://www.alarmshop.com.br/manuais/pos58/driver_macos.zip", titulo: "Baixar driver POS-58 para macOS", descricao: "Instale o driver e adicione a fila POS-58 em Impressoras e Scanners." },
    },
  },
  {
    id: "epson-t20", nome: "Epson TM-T20 / TM-T20X", fabricante: "Epson", largura: "80 mm",
    descricao: "Linha Epson de cupom não fiscal, normalmente com corte automático.", conexao: "USB, serial ou rede, conforme a versão do equipamento.",
    drivers: {
      windows: { href: "https://epson.com.br/Suporte/Ponto-de-venda/Impressoras-de-recibos/Epson-TM-T20X/s/SPT_C31CH26031", titulo: "Abrir driver oficial Epson", descricao: "Na página Epson, escolha Windows e baixe o Driver da impressora." },
      macos: { href: "https://epson.com.br/Suporte/Ponto-de-venda/Impressoras-de-recibos/Epson-TM-T20X/s/SPT_C31CH26031", titulo: "Abrir suporte oficial Epson", descricao: "Escolha macOS na página do fabricante ou instale a fila indicada pelo suporte Epson." },
    },
  },
  {
    id: "elgin-i9", nome: "Elgin i8 / i9", fabricante: "Elgin", largura: "80 mm",
    descricao: "Linha térmica de cupom para maior volume de pedidos.", conexao: "USB, rede ou serial, dependendo do modelo.",
    drivers: {
      windows: { href: "https://www.elgin.com.br/automacao/developers/suporte-tecnico", titulo: "Abrir suporte e driver Elgin", descricao: "Baixe o Driver Spooler da família i8/i9 para o seu Windows." },
      macos: { href: "https://www.elgin.com.br/automacao/developers/suporte-tecnico", titulo: "Abrir suporte Elgin", descricao: "Confirme com a Elgin o driver CUPS compatível para a revisão do equipamento." },
    },
  },
  {
    id: "bematech-mp4200", nome: "Bematech MP-4200 TH", fabricante: "Bematech / Elgin", largura: "80 mm",
    descricao: "Impressora não fiscal MP-4200, incluindo variantes TH e ADV.", conexao: "USB ou rede; em rede, configure IP/porta antes de abrir o QZ.",
    drivers: {
      windows: { href: "https://www.elgin.com.br/automacao/developers/suporte-tecnico", titulo: "Abrir suporte Bematech/Elgin", descricao: "Baixe o spooler/driver MP-4200 adequado à sua versão do Windows." },
      macos: { href: "https://www.elgin.com.br/automacao/developers/suporte-tecnico", titulo: "Abrir suporte Bematech/Elgin", descricao: "Consulte o fabricante para a fila CUPS compatível com sua interface." },
    },
  },
  {
    id: "daruma-dr800", nome: "Daruma DR800", fabricante: "Daruma", largura: "80 mm",
    descricao: "Impressora térmica Daruma; no Windows costuma exigir driver e spooler.", conexao: "USB ou serial; verifique a porta escolhida no instalador.",
    drivers: {
      windows: { href: "https://tedsys-software.atlassian.net/wiki/spaces/BDCSUP/pages/17039482", titulo: "Abrir guia de driver DR800", descricao: "Instale primeiro o driver DR800 e depois o spooler, conforme o guia." },
      macos: { href: "https://tedsys-software.atlassian.net/wiki/spaces/BDCSUP/pages/17039482", titulo: "Verificar suporte DR800", descricao: "A DR800 é legada; confirme com o suporte se há driver macOS para sua revisão." },
    },
  },
  {
    id: "sweda-si300", nome: "Sweda SI-300S", fabricante: "Sweda", largura: "80 mm",
    descricao: "Linha Sweda SI-300 para cupom térmico de alta velocidade.", conexao: "USB, serial ou Ethernet, conforme o modelo.",
    drivers: {
      windows: { href: "https://sweda.com.br/acervo-tecnico/", titulo: "Abrir drivers Sweda", descricao: "No acervo, procure SI-300S e baixe o driver Windows correspondente." },
      macos: { href: "https://sweda.com.br/acervo-tecnico/", titulo: "Abrir suporte Sweda", descricao: "Confirme no acervo técnico se há suporte macOS para o modelo instalado." },
    },
  },
  {
    id: "generica-58", nome: "Genérica ESC/POS 58 mm", fabricante: "Genérica", largura: "58 mm",
    descricao: "Para impressoras sem marca clara que usam papel de 58 mm e protocolo ESC/POS.", conexao: "USB, rede ou Bluetooth após adicionar a fila no sistema.",
    drivers: {
      windows: { href: "https://www.alarmshop.com.br/manuais/pos58/driver_windows.exe", titulo: "Baixar driver POS-58 compatível", descricao: "Use apenas se o manual/equipamento indicar compatibilidade POS-58." },
      macos: { href: "https://www.alarmshop.com.br/manuais/pos58/driver_macos.zip", titulo: "Baixar driver POS-58 compatível", descricao: "Use apenas se o manual/equipamento indicar compatibilidade POS-58." },
    },
  },
  {
    id: "generica-80", nome: "Genérica ESC/POS 80 mm", fabricante: "Genérica", largura: "80 mm",
    descricao: "Para impressoras ESC/POS de 80 mm sem marca ou modelo identificado.", conexao: "USB, rede ou Bluetooth após adicionar a fila no sistema.",
    drivers: {
      windows: { href: "https://help.nextar.com/tutorial/how-to-install-pos-58-or-pos-80-printer", titulo: "Abrir guia POS-80 para Windows", descricao: "Use o driver indicado pelo fabricante e selecione POS-80 durante a instalação." },
      macos: { href: "https://www.alarmshop.com.br/pos58/", titulo: "Abrir guia de filas térmicas", descricao: "Instale uma fila ESC/POS/Raw compatível; confirme o modelo no manual da impressora." },
    },
  },
  {
    id: "outro", nome: "Outro modelo", fabricante: "Outro fabricante", largura: "80 mm",
    descricao: "Use quando o modelo não estiver na lista ou quando tiver dúvida sobre compatibilidade.", conexao: "Adicione a impressora no sistema operacional antes de configurar o QZ Tray.",
    drivers: {
      windows: { href: "https://qz.io/docs/printers", titulo: "Ver requisitos de impressora do QZ", descricao: "Baixe o driver somente no site do fabricante e faça o teste pelo Windows." },
      macos: { href: "https://qz.io/docs/printers", titulo: "Ver requisitos de impressora do QZ", descricao: "Baixe o driver no fabricante ou configure uma fila CUPS indicada por ele." },
    },
  },
];

export default function ConfiguracaoImpressaoPage() {
  const [sistema, setSistema] = useState<Sistema>("windows");
  const [modeloId, setModeloId] = useState("oasis-pos58");

  useEffect(() => {
    const sistemaSalvo = window.localStorage.getItem(SISTEMA_STORAGE_KEY);
    const modeloSalvo = window.localStorage.getItem(MODELO_STORAGE_KEY);
    if (sistemaSalvo === "windows" || sistemaSalvo === "macos") setSistema(sistemaSalvo);
    if (modeloSalvo && MODELOS.some((modelo) => modelo.id === modeloSalvo)) setModeloId(modeloSalvo);
    window.dispatchEvent(new Event("ohfome:abrir-configuracao-impressao"));
  }, []);

  const modelo = MODELOS.find((item) => item.id === modeloId) ?? MODELOS[0];
  const driver = modelo.drivers[sistema];
  const instaladorConfianca = sistema === "windows" ? "/qz/instalar-qz-ohfome-windows.bat" : "/qz/instalar-qz-ohfome-macos.command";

  function selecionarSistema(valor: Sistema) {
    setSistema(valor);
    window.localStorage.setItem(SISTEMA_STORAGE_KEY, valor);
  }

  function selecionarModelo(valor: string) {
    setModeloId(valor);
    window.localStorage.setItem(MODELO_STORAGE_KEY, valor);
  }

  function abrirPainel() {
    window.dispatchEvent(new Event("ohfome:abrir-configuracao-impressao"));
  }

  return <div className="of-page pb-28">
    <div className="of-page-header">
      <div>
        <p className="of-eyebrow">Estação do balcão</p>
        <h1 className="of-title">Impressão</h1>
        <p className="of-subtitle">Prepare este computador uma única vez. Depois, os pedidos imprimem em qualquer tela do OhFome.</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="of-btn-secondary justify-center"><Download size={17} /> Baixar QZ Tray</a><button onClick={abrirPainel} className="of-btn-primary"><Printer size={17} /> Configurar estação</button></div>
    </div>

    <section className="mb-5 overflow-hidden rounded-[1.6rem] border border-ink-900 bg-ink-900 p-6 text-white shadow-[0_24px_60px_-38px_rgba(25,23,20,.7)] sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-white/75"><MonitorCog size={14} className="text-coral-300" /> Estação persistente</span>
          <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold tracking-[-.05em]">Configure driver, QZ e impressora no mesmo lugar.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">A seleção fica neste computador. QZ Tray encontra a fila local, inclusive impressoras USB, rede e Bluetooth já instaladas no sistema.</p>
        </div>
        <button onClick={abrirPainel} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-coral-500 px-4 text-sm font-semibold text-white transition hover:bg-coral-400 active:scale-[.98]"><Printer size={17} /> Abrir painel da estação <ChevronRight size={16} /></button>
      </div>
    </section>

    <section className="of-panel mb-5 overflow-hidden">
      <div className="border-b border-cream-200 px-5 py-4 sm:px-6"><p className="text-sm font-semibold text-ink-900">1. Escolha a impressora desta estação</p><p className="mt-1 text-xs leading-5 text-ink-500">Primeiro escolha o sistema, depois o modelo. Os links abaixo são ajustados para a sua escolha.</p></div>
      <div className="space-y-5 p-5 sm:p-6">
        <div><p className="mb-2 text-xs font-semibold text-ink-700">Sistema operacional</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => selecionarSistema("windows")} className={sistema === "windows" ? "of-btn-primary min-h-10 px-4" : "of-btn-secondary min-h-10 px-4"}><Laptop size={16} /> Windows</button><button type="button" onClick={() => selecionarSistema("macos")} className={sistema === "macos" ? "of-btn-primary min-h-10 px-4" : "of-btn-secondary min-h-10 px-4"}><Laptop size={16} /> macOS</button></div></div>
        <div><p className="mb-2 text-xs font-semibold text-ink-700">Modelo da impressora</p><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{MODELOS.map((item) => <button key={item.id} type="button" onClick={() => selecionarModelo(item.id)} className={`rounded-xl border p-3 text-left transition ${modelo.id === item.id ? "border-coral-500 bg-coral-050 ring-1 ring-coral-200" : "border-cream-200 bg-white hover:border-ink-300"}`}><span className="block text-sm font-semibold text-ink-900">{item.nome}</span><span className="mt-1 block text-[11px] text-ink-500">{item.fabricante} · {item.largura}</span></button>)}</div></div>
      </div>
    </section>

    <section className="of-panel mb-5 overflow-hidden">
      <div className="border-b border-cream-200 px-5 py-4 sm:px-6"><p className="text-sm font-semibold text-ink-900">2. Instale {modelo.nome}</p><p className="mt-1 text-xs leading-5 text-ink-500">Recomendação: papel {modelo.largura}. {modelo.conexao}</p></div>
      <div className="grid gap-3 p-5 md:grid-cols-3 sm:p-6">
        <a href={driver.href} target="_blank" rel="noreferrer" className="rounded-xl border border-cream-200 bg-cream-50 p-4 transition hover:border-coral-300 hover:bg-coral-050"><Download size={18} className="text-coral-600" /><p className="mt-3 text-sm font-semibold text-ink-900">{driver.titulo}</p><p className="mt-1 text-xs leading-5 text-ink-500">{driver.descricao}</p><span className="mt-3 inline-flex items-center text-xs font-semibold text-coral-600">Abrir link <ChevronRight size={14} /></span></a>
        <a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="rounded-xl border border-cream-200 bg-cream-50 p-4 transition hover:border-coral-300 hover:bg-coral-050"><ShieldCheck size={18} className="text-coral-600" /><p className="mt-3 text-sm font-semibold text-ink-900">Instalar QZ Tray</p><p className="mt-1 text-xs leading-5 text-ink-500">Baixe o QZ Tray para {sistema === "windows" ? "Windows" : "macOS"} e deixe-o aberto perto do relógio.</p><span className="mt-3 inline-flex items-center text-xs font-semibold text-coral-600">Abrir download <ChevronRight size={14} /></span></a>
        <a href={instaladorConfianca} download className="rounded-xl border border-cream-200 bg-cream-50 p-4 transition hover:border-coral-300 hover:bg-coral-050"><CheckCircle2 size={18} className="text-coral-600" /><p className="mt-3 text-sm font-semibold text-ink-900">Autorizar OhFome no QZ</p><p className="mt-1 text-xs leading-5 text-ink-500">Baixe e execute o instalador para não precisar aceitar cada pedido manualmente.</p><span className="mt-3 inline-flex items-center text-xs font-semibold text-coral-600">Baixar instalador <ChevronRight size={14} /></span></a>
      </div>
      <div className="flex gap-3 border-t border-cream-200 bg-cream-50/50 px-5 py-4 text-xs leading-5 text-ink-600 sm:px-6"><Wifi size={16} className="mt-0.5 shrink-0 text-coral-600" /><p>Impressora de <strong>rede ou Bluetooth</strong>: instale-a primeiro nas configurações de impressão do {sistema === "windows" ? "Windows" : "macOS"}. Quando imprimir a página de teste do sistema, ela aparecerá na lista do QZ Tray.</p></div>
    </section>

    <section className="of-panel overflow-hidden">
      <div className="border-b border-cream-200 px-5 py-4 sm:px-6"><p className="text-sm font-semibold text-ink-900">3. Finalize no OhFome</p><p className="mt-1 text-xs leading-5 text-ink-500">Após instalar e testar o driver, abra o painel, escolha a fila encontrada e ative a impressão automática.</p></div>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex gap-3"><CircleHelp size={18} className="mt-0.5 text-ink-400" /><p className="max-w-xl text-xs leading-5 text-ink-500">O nome exibido pelo QZ pode ser diferente do modelo, por exemplo “Printer POS-58”. Escolha a fila que imprimiu a página de teste.</p></div><button onClick={abrirPainel} className="of-btn-primary shrink-0"><Printer size={16} /> Configurar estação</button></div>
    </section>
  </div>;
}
