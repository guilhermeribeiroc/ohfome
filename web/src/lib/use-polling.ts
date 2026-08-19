"use client";

import { useCallback, useEffect, useState } from "react";

// Busca um endpoint e refaz a busca periodicamente — a forma mais simples de
// manter as telas de balcao/cozinha/garcom perto de tempo real sem abrir
// WebSocket. setDados fica exposto pra permitir atualizacao otimista entre
// uma rodada de polling e outra.
export function usePolling<T>(url: string, intervalMs = 4000) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Não foi possível carregar os dados.");
      setDados(await res.json());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [url]);

  useEffect(() => {
    const primeiraBusca = setTimeout(recarregar, 0);
    const id = setInterval(recarregar, intervalMs);
    return () => {
      clearTimeout(primeiraBusca);
      clearInterval(id);
    };
  }, [recarregar, intervalMs]);

  return { dados, carregando, erro, recarregar, setDados };
}
