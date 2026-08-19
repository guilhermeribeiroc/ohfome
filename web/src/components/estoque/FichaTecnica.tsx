"use client";

import { useState } from "react";
import type { FichaTecnicaItem, Insumo } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

export function FichaTecnica({ produtoId }: { produtoId: string }) {
  const { dados, recarregar } = usePolling<FichaTecnicaItem[]>(`/api/produtos/${produtoId}/insumos`, 20000);
  const { dados: insumos } = usePolling<Insumo[]>("/api/insumos", 20000);
  const itens = dados ?? [];

  const [insumoId, setInsumoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [enviando, setEnviando] = useState(false);

  const disponiveis = (insumos ?? []).filter((i) => !itens.some((item) => item.insumoId === i.id));

  async function adicionar() {
    if (!insumoId || !quantidade) return;
    setEnviando(true);
    await fetch(`/api/produtos/${produtoId}/insumos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insumoId, quantidadeNecessaria: Number(quantidade) }),
    });
    setEnviando(false);
    setInsumoId("");
    setQuantidade("");
    recarregar();
  }

  async function remover(idInsumo: string) {
    await fetch(`/api/produtos/${produtoId}/insumos/${idInsumo}`, { method: "DELETE" });
    recarregar();
  }

  return (
    <div className="mt-4 rounded-2xl bg-cream-50 p-4">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Ficha técnica <span className="normal-case text-ink-400">— baixa o estoque automaticamente a cada venda</span>
      </p>

      {itens.length === 0 && <p className="mb-2 text-xs text-ink-400">Nenhum insumo vinculado ainda.</p>}

      <ul className="mb-3 space-y-1.5">
        {itens.map((item) => (
          <li key={item.insumoId} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm shadow-sm">
            <span className="text-ink-900">
              {item.quantidadeNecessaria} {item.unidadeMedida} de {item.insumoNome}
            </span>
            <button onClick={() => remover(item.insumoId)} className="text-xs font-semibold text-danger-600 hover:underline">
              Remover
            </button>
          </li>
        ))}
      </ul>

      {disponiveis.length > 0 && (
        <div className="flex gap-2">
          <select
            value={insumoId}
            onChange={(e) => setInsumoId(e.target.value)}
            className="flex-1 rounded-xl bg-surface px-2.5 py-2 text-xs text-ink-900 outline-none focus:ring-2 focus:ring-coral-200"
          >
            <option value="">Selecionar insumo</option>
            {disponiveis.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome} ({i.unidadeMedida})
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.001"
            min={0}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Qtd."
            className="w-20 rounded-xl bg-surface px-2.5 py-2 text-xs text-ink-900 outline-none focus:ring-2 focus:ring-coral-200"
          />
          <button
            onClick={adicionar}
            disabled={enviando || !insumoId || !quantidade}
            className="rounded-full px-3.5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-40"
            style={{ background: "linear-gradient(120deg, var(--color-coral-600), var(--color-coral-500), var(--color-mango-500))" }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
