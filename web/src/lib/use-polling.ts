"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Busca um endpoint e refaz a busca periodicamente — a forma mais simples de
// manter as telas de balcao/cozinha/garcom perto de tempo real sem abrir
// WebSocket. setDados fica exposto pra permitir atualizacao otimista entre
// uma rodada de polling e outra.
export function usePolling<T>(url: string, intervalMs = 4000) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Guarda o texto bruto da ultima resposta pra pular o re-render quando nada
  // mudou — sem isso, cada tick do polling troca a referencia do array/objeto
  // e obriga a tela inteira (Kanban, lista de mesas etc.) a re-renderizar do
  // zero mesmo sem nenhuma mudanca real, pesando em telas com muitos cards.
  const ultimaRespostaRef = useRef<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Não foi possível carregar os dados.");
      const texto = await res.text();
      if (texto !== ultimaRespostaRef.current) {
        ultimaRespostaRef.current = texto;
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
    const primeiraBusca = setTimeout(recarregar, 0);
    const id = setInterval(recarregar, intervalMs);
    return () => {
      clearTimeout(primeiraBusca);
      clearInterval(id);
    };
  }, [recarregar, intervalMs]);

  return { dados, carregando, erro, recarregar, setDados };
}
