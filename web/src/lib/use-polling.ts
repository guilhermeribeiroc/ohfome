"use client";

import { useCallback, useSyncExternalStore } from "react";

// Um "poller" por URL, compartilhado entre todas as instancias de usePolling
// que pedem essa URL — antes cada instancia tinha seu proprio setInterval e
// seu proprio fetch, entao duas telas (ou um modal aberto sobre uma tela)
// pedindo a mesma URL ao mesmo tempo disparavam duas buscas identicas por
// tick. O poller sobrevive a montagens/desmontagens dos componentes: quando o
// ultimo assinante sai, o timer para mas o ultimo dado fica guardado, pra
// quem voltar a essa URL ver algo na hora em vez de tela em branco.
interface InstantaneoPoller<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
}

interface Poller {
  ultimoTexto: string | null;
  snapshot: InstantaneoPoller<unknown>;
  assinantes: Map<symbol, { intervalMs: number; pausarQuandoOculta: boolean }>;
  ouvintes: Set<() => void>;
  timerId: ReturnType<typeof setInterval> | null;
  emBusca: boolean;
}

const SNAPSHOT_INICIAL: InstantaneoPoller<unknown> = { dados: null, carregando: true, erro: null };
const pollers = new Map<string, Poller>();

export function limparCachePolling() {
  pollers.clear();
}

function obterOuCriarPoller(url: string): Poller {
  let poller = pollers.get(url);
  if (!poller) {
    poller = { ultimoTexto: null, snapshot: SNAPSHOT_INICIAL, assinantes: new Map(), ouvintes: new Set(), timerId: null, emBusca: false };
    pollers.set(url, poller);
  }
  return poller;
}

function notificar(poller: Poller) {
  poller.ouvintes.forEach((ouvinte) => ouvinte());
}

async function executarBusca(url: string): Promise<void> {
  const poller = pollers.get(url);
  if (!poller) return;
  poller.emBusca = true;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Não foi possível carregar os dados.");
    const texto = await res.text();
    // Pula o re-render quando o corpo da resposta e identico ao anterior —
    // sem isso, cada tick do polling troca a referencia do array/objeto e
    // obriga a tela inteira (Kanban, lista de mesas etc.) a re-renderizar do
    // zero mesmo sem nenhuma mudanca real, pesando em telas com muitos cards.
    if (texto !== poller.ultimoTexto) {
      poller.ultimoTexto = texto;
      poller.snapshot = { dados: JSON.parse(texto), carregando: false, erro: null };
    } else if (poller.snapshot.carregando || poller.snapshot.erro) {
      poller.snapshot = { ...poller.snapshot, carregando: false, erro: null };
    }
    notificar(poller);
  } catch (e) {
    poller.snapshot = { ...poller.snapshot, carregando: false, erro: (e as Error).message };
    notificar(poller);
  } finally {
    poller.emBusca = false;
  }
}

// Chamada do tick periodico: pula o tick se a busca anterior ainda estiver em
// voo (rede lenta) — o proximo tick tenta de novo, sem empilhar requisicoes.
// Chamada manual (recarregar) nunca pula essa checagem: quem faz
// `await recarregar()` depois de criar um pedido (ex: FinanceiroModule)
// precisa de uma busca de verdade iniciada ali, nao de uma promise
// reaproveitada de um tick que comecou antes da mutacao e ainda nao reflete
// o que acabou de mudar no servidor.
function buscarPorTick(url: string) {
  const poller = pollers.get(url);
  if (!poller || poller.emBusca) return;
  void executarBusca(url);
}

function algumAssinantePedeSemPausa(poller: Poller) {
  for (const assinante of poller.assinantes.values()) if (!assinante.pausarQuandoOculta) return true;
  return false;
}

function recalcularTimer(url: string) {
  const poller = pollers.get(url);
  if (!poller) return;
  if (poller.timerId !== null) { clearInterval(poller.timerId); poller.timerId = null; }
  if (poller.assinantes.size === 0) return;
  if (!algumAssinantePedeSemPausa(poller) && document.hidden) return;

  const menorIntervalo = Math.min(...[...poller.assinantes.values()].map((a) => a.intervalMs));
  poller.timerId = setInterval(() => buscarPorTick(url), menorIntervalo);
}

let ouvinteVisibilidadeRegistrado = false;
function garantirOuvinteVisibilidade() {
  if (ouvinteVisibilidadeRegistrado) return;
  ouvinteVisibilidadeRegistrado = true;
  document.addEventListener("visibilitychange", () => {
    for (const [url, poller] of pollers) {
      if (poller.assinantes.size === 0) continue; // ninguem olhando esta URL agora — nao reativa so porque a aba voltou
      if (!document.hidden) buscarPorTick(url);
      recalcularTimer(url);
    }
  });
}

function assinar(url: string, intervalMs: number, pausarQuandoOculta: boolean, ouvinte: () => void) {
  const poller = obterOuCriarPoller(url);
  const id = Symbol();
  const eraPrimeiroAssinante = poller.assinantes.size === 0;
  poller.assinantes.set(id, { intervalMs, pausarQuandoOculta });
  poller.ouvintes.add(ouvinte);
  garantirOuvinteVisibilidade();
  recalcularTimer(url);
  if (eraPrimeiroAssinante) void executarBusca(url);

  return () => {
    poller.assinantes.delete(id);
    poller.ouvintes.delete(ouvinte);
    recalcularTimer(url);
  };
}

// Busca um endpoint e refaz a busca periodicamente — a forma mais simples de
// manter as telas de balcao/cozinha/garcom perto de tempo real sem abrir
// WebSocket. setDados fica exposto pra permitir atualizacao otimista entre
// uma rodada de polling e outra.
//
// Por padrao o polling para quando a aba fica oculta (pausarQuandoOculta) —
// ninguem esta olhando, entao nao ha motivo pra continuar batendo na API. Ao
// voltar a ficar visivel, busca na hora (sem esperar o proximo tick) pra nao
// mostrar dado velho. A estacao de impressao e a excecao: ela roda mesmo
// minimizada, entao passa pausarQuandoOculta: false.
export function usePolling<T>(url: string, intervalMs = 4000, opcoes?: { pausarQuandoOculta?: boolean }) {
  const pausarQuandoOculta = opcoes?.pausarQuandoOculta ?? true;

  const subscribe = useCallback(
    (ouvinte: () => void) => assinar(url, intervalMs, pausarQuandoOculta, ouvinte),
    [url, intervalMs, pausarQuandoOculta],
  );
  const getSnapshot = useCallback(() => (pollers.get(url)?.snapshot ?? SNAPSHOT_INICIAL) as InstantaneoPoller<T>, [url]);
  const getServerSnapshot = useCallback(() => SNAPSHOT_INICIAL as InstantaneoPoller<T>, []);

  const { dados, carregando, erro } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const recarregar = useCallback(() => executarBusca(url), [url]);

  const setDados = useCallback((atualizador: T | null | ((atual: T | null) => T | null)) => {
    const poller = pollers.get(url);
    if (!poller) return;
    const valorAtual = poller.snapshot.dados as T | null;
    const novoValor = typeof atualizador === "function" ? (atualizador as (atual: T | null) => T | null)(valorAtual) : atualizador;
    poller.snapshot = { ...poller.snapshot, dados: novoValor };
    notificar(poller);
  }, [url]);

  return { dados, carregando, erro, recarregar, setDados };
}
