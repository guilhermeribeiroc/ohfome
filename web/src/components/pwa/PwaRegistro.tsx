"use client";

import { useEffect, useState } from "react";
import { Download, MonitorDown, WifiOff } from "lucide-react";

type EventoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global { interface Window { __ohfomeInstallPrompt?: EventoInstalacao } }

// Tempo em segundo plano a partir do qual consideramos a pagina "velha o
// suficiente" pra recarregar sozinha ao voltar — evita perder um pedido
// sendo montado numa troca rapida de app, mas resolve o app instalado
// (PWA) travando depois de um tempo minimizado/em segundo plano.
const MINUTOS_PARA_RECARREGAR_AO_VOLTAR = 3;

export function PwaRegistro() {
  useEffect(() => {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/ohfome-admin.webmanifest?v=1";
    document.head.appendChild(manifest);
    const guardarPrompt = (evento: Event) => {
      evento.preventDefault();
      window.__ohfomeInstallPrompt = evento as EventoInstalacao;
      window.dispatchEvent(new Event("ohfome-installable"));
    };
    window.addEventListener("beforeinstallprompt", guardarPrompt);
    if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/ohfome-sw.js?v=1").catch(() => undefined);

    // Celular/PWA instalado costuma suspender os timers de polling quando o
    // app fica em segundo plano por um tempo; ao voltar, a tela ficava
    // "travada" ate o usuario fechar e abrir de novo. Recarregar sozinho
    // resolve isso sem exigir essa acao manual.
    let escondidoDesdeMs: number | null = null;
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") {
        escondidoDesdeMs = Date.now();
        return;
      }
      if (document.visibilityState === "visible" && escondidoDesdeMs !== null) {
        const minutosEscondido = (Date.now() - escondidoDesdeMs) / 60_000;
        escondidoDesdeMs = null;
        if (minutosEscondido >= MINUTOS_PARA_RECARREGAR_AO_VOLTAR) window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      window.removeEventListener("beforeinstallprompt", guardarPrompt);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      manifest.remove();
    };
  }, []);
  return null;
}

export function InstalarOhFome() {
  const [instalavel, setInstalavel] = useState(false);
  const [offline, setOffline] = useState(false);
  const [abrirAjuda, setAbrirAjuda] = useState(false);
  useEffect(() => {
    const atualizar = () => setInstalavel(Boolean(window.__ohfomeInstallPrompt));
    atualizar();
    window.addEventListener("ohfome-installable", atualizar);
    const rede = () => setOffline(!navigator.onLine);
    rede(); window.addEventListener("online", rede); window.addEventListener("offline", rede);
    return () => { window.removeEventListener("ohfome-installable", atualizar); window.removeEventListener("online", rede); window.removeEventListener("offline", rede); };
  }, []);
  async function instalar() {
    const prompt = window.__ohfomeInstallPrompt;
    if (!prompt) return setAbrirAjuda(true);
    await prompt.prompt();
    const escolha = await prompt.userChoice;
    if (escolha.outcome === "accepted") { window.__ohfomeInstallPrompt = undefined; setInstalavel(false); }
  }
  return <section className="of-panel p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="of-eyebrow">Aplicativo do restaurante</p><h2 className="mt-1 font-display text-xl font-semibold text-ink-900">Instalar OhFome neste dispositivo</h2><p className="mt-2 max-w-xl text-sm leading-6 text-ink-500">Adicione o sistema à tela inicial ou ao computador para abrir como aplicativo. Pedidos, Pix e impressão continuam exigindo conexão.</p></div><button onClick={instalar} className="of-btn-primary"><Download size={16} /> {instalavel ? "Instalar aplicativo" : "Como instalar"}</button></div>
    {offline && <p className="mt-4 flex items-center gap-2 rounded-xl bg-coral-050 p-3 text-xs text-coral-700"><WifiOff size={15} /> Sem internet: consulta e pedidos ficam bloqueados até reconectar.</p>}
    {abrirAjuda && <div className="mt-4 rounded-2xl border border-cream-200 bg-cream-50 p-4 text-sm leading-6 text-ink-600"><b className="flex items-center gap-2 text-ink-800"><MonitorDown size={16} /> Instalação pelo navegador</b><p className="mt-2">No Chrome ou Edge, abra o menu do navegador e escolha <b>Instalar OhFome</b> ou <b>Adicionar à tela inicial</b>. No celular, use o menu Compartilhar e selecione <b>Adicionar à Tela de Início</b>.</p></div>}
  </section>;
}
