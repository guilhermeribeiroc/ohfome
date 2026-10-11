"use client";

import { useState } from "react";
import { Minus, PackagePlus, Plus, RefreshCw } from "lucide-react";
import { usePolling } from "@/lib/use-polling";

type ProdutoEstoque = {
  produtoId: string;
  nome: string;
  tamanho?: string | null;
  controlaEstoqueUnidades: boolean;
  saldoFisico: number | null;
  comprometido: number;
  disponivel: number;
};

export function EstoqueProdutosUnidades() {
  const { dados, recarregar } = usePolling<ProdutoEstoque[]>("/api/estoque/produtos", 20_000);
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function enviar(produtoId: string, acao: "entrada" | "ajuste", quantidade: number) {
    if (!Number.isInteger(quantidade) || quantidade < 0) { setErro("Use uma quantidade inteira igual ou maior que zero."); return; }
    setOcupado(produtoId); setErro("");
    try {
      const resposta = await fetch("/api/estoque/produtos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produtoId, acao, quantidade }) });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(corpo?.erro ?? "Não foi possível atualizar o estoque.");
      setEdicoes((atual) => ({ ...atual, [produtoId]: "" }));
      recarregar();
    } catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível atualizar o estoque."); }
    finally { setOcupado(null); }
  }

  async function configurar(produtoId: string, ativo: boolean) {
    const texto = ativo ? "0" : "";
    if (ativo) setEdicoes((atual) => ({ ...atual, [produtoId]: atual[produtoId] ?? texto }));
    setOcupado(produtoId); setErro("");
    try {
      const resposta = await fetch("/api/estoque/produtos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produtoId, acao: "configurar", ativo, saldoInicial: ativo ? Number(edicoes[produtoId] ?? 0) : 0 }) });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(corpo?.erro ?? "Não foi possível configurar o produto.");
      recarregar();
    } catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível configurar o produto."); }
    finally { setOcupado(null); }
  }

  return <section className="of-panel overflow-hidden">
    <header className="border-b border-cream-100 px-4 py-4 sm:px-5"><p className="font-display text-lg font-bold text-ink-900">Produtos por unidade</p><p className="mt-1 text-xs leading-5 text-ink-400">Ative apenas itens de revenda, como latas e garrafas. O saldo é compartilhado por balcão, mesa e delivery.</p></header>
    {erro && <p className="mx-4 mt-4 rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-600">{erro}</p>}
    <div className="divide-y divide-cream-100">{(dados ?? []).map((produto) => {
      const valor = edicoes[produto.produtoId] ?? "";
      const nome = `${produto.nome}${produto.tamanho ? ` (${produto.tamanho})` : ""}`;
      const carregando = ocupado === produto.produtoId;
      return <article key={produto.produtoId} className="px-4 py-4 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-ink-900">{nome}</p>{produto.controlaEstoqueUnidades ? <p className="mt-1 text-xs text-ink-500"><b className="text-ink-900">{produto.disponivel}</b> disponíveis · {produto.comprometido} comprometida(s) · físico {produto.saldoFisico ?? 0}</p> : <p className="mt-1 text-xs text-ink-400">Controle unitário desativado</p>}</div><button disabled={carregando} onClick={() => void configurar(produto.produtoId, !produto.controlaEstoqueUnidades)} className="of-btn-secondary !min-h-9 !px-3 !text-xs disabled:opacity-50">{produto.controlaEstoqueUnidades ? <><Minus size={14} /> Desativar</> : <><PackagePlus size={14} /> Controlar unidades</>}</button></div>{produto.controlaEstoqueUnidades && <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,150px)_auto_auto]"><input inputMode="numeric" min="0" step="1" value={valor} onChange={(evento) => setEdicoes((atual) => ({ ...atual, [produto.produtoId]: evento.target.value.replace(/[^0-9]/g, "") }))} placeholder="Quantidade" className="of-field !min-h-10" /><button disabled={carregando || !valor} onClick={() => void enviar(produto.produtoId, "entrada", Number(valor))} className="of-btn-primary !min-h-10 !px-3 !text-xs disabled:opacity-50"><Plus size={14} /> Adicionar</button><button disabled={carregando || valor === ""} onClick={() => void enviar(produto.produtoId, "ajuste", Number(valor))} className="of-btn-secondary !min-h-10 !px-3 !text-xs disabled:opacity-50"><RefreshCw size={14} /> Ajustar contagem</button></div>}</article>;
    })}{!(dados ?? []).length && <p className="p-6 text-center text-sm text-ink-400">Nenhum produto cadastrado.</p>}</div>
  </section>;
}
