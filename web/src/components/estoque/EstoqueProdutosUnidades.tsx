"use client";

import { useState } from "react";
import { Minus, PackagePlus, Plus, RefreshCw } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { CategoriaChips, CategoriaColuna } from "@/components/ui/CategoriaChips";

type ProdutoEstoque = {
  produtoId: string;
  nome: string;
  tamanho?: string | null;
  imagemUrl?: string | null;
  categoriaId: string | null;
  categoriaNome: string;
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
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState("");

  const categorias = Array.from(new Set((dados ?? []).map((produto) => produto.categoriaNome))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const itensCategorias = [{ valor: "", rotulo: "Todas", quantidade: (dados ?? []).length }, ...categorias.map((nome) => ({ valor: nome, rotulo: nome, quantidade: (dados ?? []).filter((produto) => produto.categoriaNome === nome).length }))];
  const listaFiltrada = (dados ?? []).filter((produto) =>
    (mostrarTodos || produto.controlaEstoqueUnidades) && (!categoriaFiltro || produto.categoriaNome === categoriaFiltro)
  );

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

  async function configurar(produtoId: string, ativo: boolean, nome: string) {
    if (!ativo && !window.confirm(`Desativar o controle de unidades de "${nome}"? O produto deixa de ficar "esgotado" automaticamente quando o saldo zerar — ele volta a aparecer sempre disponível no cardápio.`)) return;
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
    <header className="border-b border-cream-100 px-4 py-4 sm:px-5">
      <p className="font-display text-lg font-bold text-ink-900">Produtos por unidade</p>
      <p className="mt-1 text-xs leading-5 text-ink-400">Ative apenas itens de revenda, como latas e garrafas. O saldo é compartilhado por balcão, mesa e delivery.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-cream-200 bg-cream-50 p-0.5 text-xs font-semibold">
          <button type="button" onClick={() => setMostrarTodos(false)} className={`rounded-[10px] px-3 py-1.5 transition ${!mostrarTodos ? "bg-surface text-coral-600 shadow-sm" : "text-ink-500"}`}>Ativos</button>
          <button type="button" onClick={() => setMostrarTodos(true)} className={`rounded-[10px] px-3 py-1.5 transition ${mostrarTodos ? "bg-surface text-coral-600 shadow-sm" : "text-ink-500"}`}>Todos os produtos</button>
        </div>
      </div>
      <div className="mt-3 lg:hidden"><CategoriaChips valor={categoriaFiltro} onChange={setCategoriaFiltro} itens={itensCategorias} /></div>
    </header>
    <div className="lg:flex">
      <aside className="hidden w-52 shrink-0 border-r border-cream-100 p-3 lg:block"><div className="sticky top-3 max-h-[70dvh] overflow-y-auto"><CategoriaColuna itens={itensCategorias} valor={categoriaFiltro} onChange={setCategoriaFiltro} /></div></aside>
      <div className="min-w-0 flex-1">
    {erro && <p className="mx-4 mt-4 rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-600">{erro}</p>}
    <div className="divide-y divide-cream-100">{listaFiltrada.map((produto) => {
      const valor = edicoes[produto.produtoId] ?? "";
      const nome = `${produto.nome}${produto.tamanho ? ` (${produto.tamanho})` : ""}`;
      const carregando = ocupado === produto.produtoId;
      return <article key={produto.produtoId} className="px-4 py-4 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cream-100">{produto.imagemUrl ? <img src={produto.imagemUrl} alt={nome} className="h-full w-full object-cover" /> : <PackagePlus size={16} className="text-ink-300" />}</div><div><p className="text-sm font-semibold text-ink-900">{nome}</p>{produto.controlaEstoqueUnidades ? <p className="mt-1 text-xs text-ink-500"><b className="text-ink-900">{produto.disponivel}</b> disponíveis · {produto.comprometido} comprometida(s) · físico {produto.saldoFisico ?? 0}</p> : <p className="mt-1 text-xs text-ink-400">Controle unitário desativado</p>}</div></div><button disabled={carregando} onClick={() => void configurar(produto.produtoId, !produto.controlaEstoqueUnidades, nome)} className="of-btn-secondary !min-h-9 !px-3 !text-xs disabled:opacity-50">{produto.controlaEstoqueUnidades ? <><Minus size={14} /> Desativar</> : <><PackagePlus size={14} /> Controlar unidades</>}</button></div>{produto.controlaEstoqueUnidades && <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,150px)_auto_auto]"><input inputMode="numeric" min="0" step="1" value={valor} onChange={(evento) => setEdicoes((atual) => ({ ...atual, [produto.produtoId]: evento.target.value.replace(/[^0-9]/g, "") }))} placeholder="Quantidade" className="of-field !min-h-10" /><button disabled={carregando || !valor} onClick={() => void enviar(produto.produtoId, "entrada", Number(valor))} className="of-btn-primary !min-h-10 !px-3 !text-xs disabled:opacity-50"><Plus size={14} /> Adicionar</button><button disabled={carregando || valor === ""} onClick={() => void enviar(produto.produtoId, "ajuste", Number(valor))} className="of-btn-secondary !min-h-10 !px-3 !text-xs disabled:opacity-50"><RefreshCw size={14} /> Ajustar contagem</button></div>}</article>;
    })}{!(dados ?? []).length && <p className="p-6 text-center text-sm text-ink-400">Nenhum produto cadastrado.</p>}
    {!!(dados ?? []).length && !listaFiltrada.length && (
      !mostrarTodos
        ? <p className="p-6 text-center text-sm text-ink-400">Nenhum produto com controle de unidades ativo{categoriaFiltro ? ` em "${categoriaFiltro}"` : ""} ainda. Toque em &quot;Todos os produtos&quot; pra escolher quais controlar.</p>
        : <p className="p-6 text-center text-sm text-ink-400">Nenhum produto {categoriaFiltro ? `em "${categoriaFiltro}"` : "cadastrado"}.</p>
    )}</div>
      </div>
    </div>
  </section>;
}
