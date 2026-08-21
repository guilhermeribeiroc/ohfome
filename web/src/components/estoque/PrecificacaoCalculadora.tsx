"use client";

import { useMemo, useRef, useState } from "react";
import { Calculator, CircleDollarSign, Image as ImageIcon, Link2, PackageSearch, Percent, Plus, Tag, Trash2, TrendingUp, Upload, X } from "lucide-react";
import { nomeProdutoComTamanho, type Categoria, type ModoPrecificacao, type Produto, type TamanhoProduto } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { mascararMoeda, moedaComCentavos, numeroDaMoeda } from "@/lib/moeda";
import { FichaTecnica } from "./FichaTecnica";

const GRADIENTE_CORAL = "linear-gradient(120deg, var(--color-coral-600), var(--color-coral-500), var(--color-mango-500))";
const CAMPO_CLASSE =
  "w-full rounded-xl border border-cream-200 bg-cream-50 px-3.5 py-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-coral-400 focus:bg-surface focus:ring-4 focus:ring-coral-100";

async function enviarArquivoImagem(arquivo: File): Promise<string> {
  const formData = new FormData();
  formData.append("arquivo", arquivo);
  const resposta = await fetch("/api/uploads/produto", { method: "POST", body: formData });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok || !dados?.url) throw new Error(dados?.erro ?? "Não foi possível enviar a imagem.");
  return dados.url as string;
}

// Espelha a função calcular_precificacao() de database/schema.sql — usado
// pra dar feedback instantâneo antes da resposta do servidor confirmar.
function calcular(produto: Produto): Produto {
  if (produto.modoPrecificacao === "margem") {
    const precoVenda = Math.round(produto.precoCusto * (1 + produto.margemPercentual / 100) * 100) / 100;
    return { ...produto, precoVenda };
  }
  const margemPercentual =
    produto.precoCusto > 0
      ? Math.round(((produto.precoVenda - produto.precoCusto) / produto.precoCusto) * 100 * 100) / 100
      : 0;
  return { ...produto, margemPercentual };
}

export function PrecificacaoCalculadora() {
  const { dados, setDados, recarregar } = usePolling<Produto[]>("/api/produtos", 15000);
  const lista = dados ?? [];
  const [selecionadoIdManual, setSelecionadoIdManual] = useState("");
  const salvarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);

  const selecionadoId = lista.some((p) => p.id === selecionadoIdManual) ? selecionadoIdManual : (lista[0]?.id ?? "");
  const selecionado = lista.find((p) => p.id === selecionadoId);
  const lucroUnitario = selecionado ? selecionado.precoVenda - selecionado.precoCusto : 0;

  function persistir(produto: Produto) {
    if (salvarTimeout.current) clearTimeout(salvarTimeout.current);
    salvarTimeout.current = setTimeout(async () => {
      setSalvando(true);
      await fetch(`/api/produtos/${produto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: produto.nome,
          tamanho: produto.tamanho ?? null,
          descricao: produto.descricao ?? "",
          imagemUrl: produto.imagemUrl ?? null,
          modoPrecificacao: produto.modoPrecificacao,
          precoCusto: produto.precoCusto,
          margemPercentual: produto.margemPercentual,
          precoVenda: produto.precoVenda,
        }),
      });
      setSalvando(false);
    }, 500);
  }

  function atualizarTexto(campo: "nome" | "descricao" | "imagemUrl", valor: string) {
    setDados((atual) => (atual ?? []).map((produto) => {
      if (produto.id !== selecionadoId) return produto;
      const atualizado = { ...produto, [campo]: valor };
      persistir(atualizado);
      return atualizado;
    }));
  }

  function atualizarTamanho(tamanho: TamanhoProduto | null) {
    setDados((atual) => (atual ?? []).map((produto) => {
      if (produto.id !== selecionadoId) return produto;
      const atualizado = { ...produto, tamanho };
      persistir(atualizado);
      return atualizado;
    }));
  }

  function atualizar(campo: keyof Produto, valor: number | ModoPrecificacao) {
    setDados((atual) =>
      (atual ?? []).map((p) => {
        if (p.id !== selecionadoId) return p;
        const modoPrecificacao = campo === "precoVenda" ? "preco_manual" : campo === "precoCusto" || campo === "margemPercentual" ? "margem" : p.modoPrecificacao;
        const atualizado = calcular({ ...p, modoPrecificacao, [campo]: valor } as Produto);
        persistir(atualizado);
        return atualizado;
      })
    );
  }

  async function desativarProduto() {
    if (!selecionado) return;
    if (!confirm(`Remover "${selecionado.nome}" do cardápio?`)) return;
    await fetch(`/api/produtos/${selecionado.id}`, { method: "DELETE" });
    setSelecionadoIdManual("");
    recarregar();
  }

  async function trocarImagem(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviandoImagem(true);
    try { atualizarTexto("imagemUrl", await enviarArquivoImagem(arquivo)); }
    catch (causa) { alert(causa instanceof Error ? causa.message : "Não foi possível enviar a imagem."); }
    finally { setEnviandoImagem(false); }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setModalAberto(true)}
          className="of-btn-primary"
        >
          <Plus size={17} /> Novo produto
        </button>
      </div>

      {!selecionado ? (
        <div className="of-panel flex min-h-52 flex-col items-center justify-center text-center"><PackageSearch size={26} className="mb-3 text-ink-400" /><p className="text-sm font-semibold text-ink-600">Nenhum produto cadastrado</p><p className="mt-1 text-xs text-ink-400">Crie o primeiro item para começar a precificação.</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="of-panel overflow-hidden">
            <p className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Cardápio</p>
            <ul className="max-h-[420px] overflow-y-auto px-2 pb-2">
              {lista.map((produto) => (
                <li key={produto.id}>
                  <button
                    onClick={() => setSelecionadoIdManual(produto.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                      produto.id === selecionadoId ? "bg-coral-050 font-semibold text-coral-600" : "text-ink-600 hover:bg-cream-100"
                    }`}
                  >
                    <span>
                      {nomeProdutoComTamanho(produto)}
                      <span className="ml-2 text-xs text-ink-400">{produto.categoriaNome}</span>
                    </span>
                    <span className="font-medium">R$ {produto.precoVenda.toFixed(2).replace(".", ",")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="of-panel p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="font-display text-lg font-bold text-ink-900">{nomeProdutoComTamanho(selecionado)}</p>
                <p className="text-xs text-ink-400">Calculadora automática de precificação</p>
              </div>
              <div className="flex items-center gap-2">
                {salvando && <span className="text-xs text-ink-400">Salvando...</span>}
                <button onClick={desativarProduto} className="flex h-10 w-10 items-center justify-center rounded-xl text-danger-600 transition hover:bg-danger-050" aria-label="Remover do cardápio" title="Remover do cardápio">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div className="mb-5 grid gap-3 rounded-2xl border border-cream-200 bg-cream-50/70 p-3 sm:grid-cols-[128px_1fr]">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-ink-900 text-white" style={selecionado.imagemUrl ? { backgroundImage: `url(${selecionado.imagemUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : { backgroundImage: "url(/menu-assets/ohfome-food-atlas.webp)", backgroundPosition: "0% 0%", backgroundSize: "300% 200%" }}><ImageIcon size={18} className={selecionado.imagemUrl ? "opacity-0" : "opacity-70"} /></div>
              <div className="space-y-2">
                <input value={selecionado.nome} onChange={(e) => atualizarTexto("nome", e.target.value)} placeholder="Nome do produto" className="of-field" />
                <SeletorTamanho value={selecionado.tamanho ?? null} onChange={atualizarTamanho} compacto />
                <textarea value={selecionado.descricao ?? ""} onChange={(e) => atualizarTexto("descricao", e.target.value)} placeholder="Descrição que aparecerá no cardápio" rows={2} className="of-field resize-none" />
                <div className="grid gap-2 sm:grid-cols-[auto_1fr]"><label className="flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-coral-300 bg-coral-050 px-3 text-xs font-semibold text-coral-700 transition hover:bg-coral-100"><Upload size={15} />{enviandoImagem ? "Enviando..." : "Enviar arquivo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => trocarImagem(e.target.files?.[0])} className="sr-only" /></label><div className="relative"><Link2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" /><input value={selecionado.imagemUrl ?? ""} onChange={(e) => atualizarTexto("imagemUrl", e.target.value)} placeholder="ou cole a URL da foto" className="of-field !min-h-[46px] !pl-9" /></div></div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-400">Preço de custo</span>
                <div className="flex min-h-[52px] items-center rounded-xl border border-cream-200 bg-surface px-3.5 transition focus-within:border-coral-400 focus-within:ring-4 focus-within:ring-coral-100">
                  <CircleDollarSign size={16} className="text-ink-400" /><span className="ml-2 text-xs font-semibold text-ink-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={selecionado.precoCusto}
                    onChange={(e) => atualizar("precoCusto", Number(e.target.value))}
                    className="w-full bg-transparent px-2 py-3 text-ink-900 outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-400">Margem de lucro</span>
                <div
                  className={`flex min-h-[52px] items-center rounded-xl border px-3.5 transition-all ${
                    selecionado.modoPrecificacao === "margem" ? "border-coral-400/60 bg-coral-050 ring-4 ring-coral-100" : "border-cream-200 bg-cream-50"
                  }`}
                >
                  <Percent size={16} className="mr-2 text-ink-400" />
                  <input
                    type="number"
                    step="0.1"
                    value={selecionado.margemPercentual}
                    onChange={(e) => atualizar("margemPercentual", Number(e.target.value))}
                    className="w-full bg-transparent py-3 text-ink-900 outline-none"
                  />
                  <span className="text-ink-400">%</span>
                </div>
              </label>
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-semibold text-ink-400">Preço de venda</span>
              <div
                className={`flex min-h-[58px] items-center rounded-xl border px-3.5 transition-all ${
                  selecionado.modoPrecificacao === "preco_manual" ? "border-coral-400/60 bg-coral-050 ring-4 ring-coral-100" : "border-cream-200 bg-cream-50"
                }`}
              >
                <CircleDollarSign size={17} className="text-ink-400" /><span className="ml-2 text-xs font-semibold text-ink-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  value={selecionado.precoVenda}
                  onChange={(e) => atualizar("precoVenda", Number(e.target.value))}
                  className="w-full bg-transparent px-2 py-3 text-lg font-bold text-ink-900 outline-none"
                />
              </div>
            </label>

            <div className={`mt-4 rounded-2xl border p-4 ${lucroUnitario < 0 ? "border-danger-400/25 bg-danger-050/70" : "border-basil-400/20 bg-basil-050/70"}`}>
              <div className="flex items-start justify-between gap-4"><div className={`flex items-center gap-2 ${lucroUnitario < 0 ? "text-danger-600" : "text-basil-600"}`}><TrendingUp size={16} /><span className="text-xs font-semibold">{lucroUnitario < 0 ? "Prejuízo estimado por unidade" : "Lucro estimado por unidade"}</span></div><strong className={`font-display text-xl tracking-tight ${lucroUnitario < 0 ? "text-danger-600" : "text-basil-600"}`}>R$ {lucroUnitario.toFixed(2).replace(".", ",")}</strong></div>
              <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${lucroUnitario < 0 ? "bg-danger-400/15" : "bg-basil-400/15"}`}><i className={`block h-full rounded-full transition-all duration-300 ${lucroUnitario < 0 ? "bg-danger-500" : "bg-basil-500"}`} style={{ width: `${Math.min(100, Math.max(4, Math.abs(selecionado.margemPercentual)))}%` }} /></div>
              <p className={`mt-2 text-[11px] leading-5 ${lucroUnitario < 0 ? "text-danger-600" : "text-ink-600"}`}>{selecionado.precoCusto === 0 ? "Informe o custo para calcular a margem real." : selecionado.modoPrecificacao === "margem" ? "Venda recalculada a partir do custo e da margem." : "Margem recalculada a partir do custo e da venda."}</p>
            </div>

            <FichaTecnica produtoId={selecionado.id} />
          </div>
        </div>
      )}

      {modalAberto && (
        <NovoProdutoModal
          onFechar={() => setModalAberto(false)}
          onCriado={(id) => {
            setModalAberto(false);
            setSelecionadoIdManual(id);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function NovoProdutoModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: (id: string) => void }) {
  const { dados: categorias, recarregar: recarregarCategorias } = usePolling<Categoria[]>("/api/categorias", 60000);
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tamanho, setTamanho] = useState<TamanhoProduto | null>(null);
  const [imagemUrl, setImagemUrl] = useState("");
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [modoPrecificacao, setModoPrecificacao] = useState<ModoPrecificacao>("margem");
  const [precoCusto, setPrecoCusto] = useState("");
  const [margemPercentual, setMargemPercentual] = useState("100");
  const [precoVendaManual, setPrecoVendaManual] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const resumo = useMemo(() => {
    const custo = Math.max(0, numeroDaMoeda(precoCusto));
    const margemInformada = Math.max(-100, Number(margemPercentual) || 0);
    const vendaManual = Math.max(0, numeroDaMoeda(precoVendaManual));
    const precoVenda = modoPrecificacao === "margem" ? Math.round(custo * (1 + margemInformada / 100) * 100) / 100 : vendaManual;
    const margem = custo > 0 ? Math.round(((precoVenda - custo) / custo) * 1000) / 10 : 0;
    return { custo, precoVenda, margem: modoPrecificacao === "margem" ? margemInformada : margem };
  }, [margemPercentual, modoPrecificacao, precoCusto, precoVendaManual]);

  function moeda(valor: number) {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  async function criar() {
    if (!nome.trim()) return;
    setEnviando(true);
    setErro("");

    let categoriaIdFinal = categoriaId || null;
    if (novaCategoria.trim()) {
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novaCategoria.trim() }),
      });
      if (res.ok) {
        const categoria = await res.json();
        categoriaIdFinal = categoria.id;
        recarregarCategorias();
      }
    }

    const res = await fetch("/api/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome,
        tamanho,
        descricao,
        imagemUrl,
        categoriaId: categoriaIdFinal,
        precoCusto: numeroDaMoeda(precoCusto),
        modoPrecificacao,
        margemPercentual: resumo.margem,
        precoVenda: resumo.precoVenda,
      }),
    });
    setEnviando(false);
    if (!res.ok) {
      const dados = await res.json().catch(() => null);
      setErro(dados?.erro ?? "Não foi possível criar o produto.");
      return;
    }
    const produto = await res.json();
    onCriado(produto.id);
  }

  async function adicionarImagem(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    setEnviandoImagem(true);
    try { setImagemUrl(await enviarArquivoImagem(arquivo)); }
    catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível enviar a imagem."); }
    finally { setEnviandoImagem(false); }
  }

  return (
    <div className="of-modal-backdrop">
      <div className="of-modal-panel flex max-w-md flex-col">
        <div className="of-panel-header bg-surface">
          <div><p className="of-eyebrow">Cardápio</p><p className="font-display text-lg font-bold text-ink-900">Novo produto</p></div>
          <button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <section className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-ink-400">Informações do item</p>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Nome do produto</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pizza Calabresa" className={CAMPO_CLASSE} /></label>
            <SeletorTamanho value={tamanho} onChange={setTamanho} />
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Descrição <em className="not-italic font-normal text-ink-400">(opcional)</em></span><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ingredientes ou detalhes que ajudam na venda" rows={2} className={`${CAMPO_CLASSE} resize-none`} /></label>
            <div className="rounded-2xl border border-cream-200 bg-cream-50/70 p-3.5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-ink-700">Imagem do produto <span className="font-normal text-ink-400">(opcional)</span></p><p className="mt-0.5 text-[11px] text-ink-400">Envie uma foto ou cole o endereço dela.</p></div><ImageIcon size={17} className="text-coral-600" /></div><label className="mt-3 flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-coral-300 bg-surface px-3 text-sm font-semibold text-coral-700 transition hover:bg-coral-050"><Upload size={16} />{enviandoImagem ? "Enviando imagem..." : "Escolher arquivo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => adicionarImagem(e.target.files?.[0])} className="sr-only" /></label><div className="my-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.12em] text-ink-400"><i className="h-px flex-1 bg-cream-200" />ou cole uma URL<i className="h-px flex-1 bg-cream-200" /></div><div className="relative"><Link2 size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={imagemUrl} onChange={(e) => setImagemUrl(e.target.value)} placeholder="https://..." className={`${CAMPO_CLASSE} !bg-surface !pl-10`} /></div>{imagemUrl && <p className="mt-2 truncate text-[11px] text-basil-600">Imagem pronta para o cardápio.</p>}</div>
          </section>

          <section className="space-y-3 rounded-2xl border border-cream-200 bg-cream-50/70 p-3.5">
            <div className="flex items-center gap-2"><Tag size={15} className="text-coral-600" /><p className="text-xs font-semibold text-ink-900">Categoria</p></div>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={`${CAMPO_CLASSE} bg-surface`}><option value="">Sem categoria</option>{(categorias ?? []).map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}</select>
            <input value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} placeholder="Ou crie uma nova categoria" className="w-full border-b border-cream-300 bg-transparent px-1 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-coral-400" />
          </section>

          <section>
            <div className="flex items-center gap-2"><Calculator size={15} className="text-coral-600" /><p className="text-xs font-semibold text-ink-900">Precificação</p></div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CampoMonetario label="Preço de custo" value={precoCusto} onChange={(valor) => { setPrecoCusto(valor); setModoPrecificacao("margem"); }} placeholder="0,00" />
              <CampoPercentual label="Margem" value={margemPercentual} onChange={(valor) => { setMargemPercentual(valor); setModoPrecificacao("margem"); }} />
              <CampoMonetario label="Preço de venda" value={precoVendaManual} onChange={(valor) => { setPrecoVendaManual(valor); setModoPrecificacao("preco_manual"); }} placeholder="0,00" destaque />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-ink-400">Altere custo ou margem para recalcular a venda; altere venda para recalcular a margem.</p>
            <div className={`mt-3 rounded-2xl p-4 ring-1 ${resumo.precoVenda < resumo.custo ? "bg-danger-050 text-danger-600 ring-danger-400/20" : "bg-basil-050 text-basil-600 ring-basil-400/20"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.13em]">{resumo.precoVenda < resumo.custo ? "Atenção: prejuízo" : modoPrecificacao === "margem" ? "Preço de venda calculado" : "Margem calculada"}</p><p className="mt-1 text-xs text-ink-600">Custo {moeda(resumo.custo)}</p></div><strong className="font-display text-2xl font-bold tracking-tight">{modoPrecificacao === "margem" ? moeda(resumo.precoVenda) : resumo.custo > 0 ? `${resumo.margem.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}</strong></div></div>
          </section>
        </div>

        <footer className="border-t border-cream-200 bg-surface p-4"><div className="mx-auto max-w-sm">{erro && <p className="mb-3 rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-600">{erro}</p>}<button onClick={criar} disabled={enviando || !nome.trim()} className="w-full rounded-xl py-3.5 text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40" style={{ background: GRADIENTE_CORAL }}>{enviando ? "Criando produto..." : "Criar produto"}</button></div></footer>
      </div>
    </div>
  );
}

function SeletorTamanho({ value, onChange, compacto = false }: { value: TamanhoProduto | null; onChange: (valor: TamanhoProduto | null) => void; compacto?: boolean }) {
  const opcoes: { valor: TamanhoProduto | null; rotulo: string }[] = [
    { valor: null, rotulo: "Sem tamanho" },
    { valor: "P", rotulo: "P" },
    { valor: "M", rotulo: "M" },
    { valor: "G", rotulo: "G" },
  ];
  return <fieldset><legend className={`mb-1.5 text-xs font-semibold ${compacto ? "text-ink-400" : "text-ink-600"}`}>Tamanho <span className="font-normal text-ink-400">(opcional)</span></legend><div className="grid grid-cols-[minmax(0,1.8fr)_repeat(3,minmax(42px,1fr))] gap-1.5 rounded-xl bg-cream-100 p-1.5">{opcoes.map((opcao) => <button key={opcao.valor ?? "nenhum"} type="button" onClick={() => onChange(opcao.valor)} aria-pressed={value === opcao.valor} className={`min-h-10 rounded-lg px-2 text-xs font-bold transition-all ${value === opcao.valor ? "bg-surface text-coral-700 shadow-sm ring-1 ring-coral-200" : "text-ink-500 hover:bg-surface/60 hover:text-ink-800"}`}>{opcao.rotulo}</button>)}</div></fieldset>;
}

function CampoMonetario({ label, value, onChange, placeholder, destaque = false }: { label: string; value: string; onChange: (valor: string) => void; placeholder: string; destaque?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">{label}</span><div className={`flex min-h-[52px] items-center rounded-xl border px-3 transition focus-within:ring-4 ${destaque ? "border-coral-400 bg-coral-050 focus-within:ring-coral-100" : "border-cream-200 bg-surface focus-within:border-coral-400 focus-within:ring-coral-100"}`}><span className="text-xs font-bold text-ink-400">R$</span><input inputMode="decimal" value={value} onChange={(e) => onChange(mascararMoeda(e.target.value))} onBlur={() => value && onChange(moedaComCentavos(value))} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-400" /></div></label>;
}

function CampoPercentual({ label, value, onChange }: { label: string; value: string; onChange: (valor: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">{label}</span><div className="flex min-h-[52px] items-center rounded-xl border border-coral-400 bg-coral-050 px-3 transition focus-within:ring-4 focus-within:ring-coral-100"><Percent size={15} className="text-coral-600" /><input type="number" inputMode="decimal" step="0.1" min={-100} value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-semibold text-ink-900 outline-none" /><span className="text-xs font-bold text-coral-600">%</span></div></label>;
}
