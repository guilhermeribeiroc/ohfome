"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Cache de curta duração, somente na memória da aba. Ele torna a volta a uma
// área já visitada instantânea; a busca em segundo plano continua sendo a
// fonte de verdade. TenantProvider limpa tudo no login, cadastro e logout.
const cachePorRota = new Map<string, string>();

export function limparCachePolling() {
  cachePorRota.clear();
}

function respostaDoCache<T>(url: string): { texto: string; dados: T } | null {
  const texto = cachePorRota.get(url);
  if (!texto) return null;
  try {
    return { texto, dados: JSON.parse(texto) as T };
  } catch {
    cachePorRota.delete(url);
    return null;
  }
}

// Busca um endpoint e refaz a busca periodicamente — a forma mais simples de
// manter as telas de balcao/cozinha/garcom perto de tempo real sem abrir
// WebSocket. setDados fica exposto pra permitir atualizacao otimista entre
// uma rodada de polling e outra.
export function usePolling<T>(url: string, intervalMs = 4000) {
  const [dados, setDados] = useState<T | null>(() => respostaDoCache<T>(url)?.dados ?? null);
  const [carregando, setCarregando] = useState(() => !respostaDoCache<T>(url));
  const [erro, setErro] = useState<string | null>(null);
  // Guarda o texto bruto da ultima resposta pra pular o re-render quando nada
  // mudou — sem isso, cada tick do polling troca a referencia do array/objeto
  // e obriga a tela inteira (Kanban, lista de mesas etc.) a re-renderizar do
  // zero mesmo sem nenhuma mudanca real, pesando em telas com muitos cards.
  const ultimaRespostaRef = useRef<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Não foi possível carregar os dados.");
      const texto = await res.text();
      if (texto !== ultimaRespostaRef.current) {
        ultimaRespostaRef.current = texto;
        cachePorRota.set(url, texto);
        setDados(JSON.parse(texto));
      }
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [url]);

  useEffect(() => {
    const armazenado = respostaDoCache<T>(url);
    ultimaRespostaRef.current = armazenado?.texto ?? null;
    const sincronizarCache = setTimeout(() => {
      if (armazenado) {
        setDados(armazenado.dados);
        setCarregando(false);
      } else {
        setDados(null);
        setCarregando(true);
      }
    }, 0);
    const primeiraBusca = setTimeout(recarregar, 0);
    const id = setInterval(recarregar, intervalMs);
    return () => {
      clearTimeout(sincronizarCache);
      clearTimeout(primeiraBusca);
      clearInterval(id);
    };
  }, [url, recarregar, intervalMs]);

  return { dados, carregando, erro, recarregar, setDados };
}
