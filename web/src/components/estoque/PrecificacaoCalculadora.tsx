"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Camera, Check, CircleDollarSign, Image as ImageIcon, Link2, Loader2, PackageSearch, Percent, Plus, ScanLine, Sparkles, Tag, Trash2, TrendingUp, Upload, X } from "lucide-react";
import { nomeProdutoComTamanho, type Categoria, type ModoPrecificacao, type Produto, type TamanhoProduto } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { mascararMoeda, moedaComCentavos, numeroDaMoeda } from "@/lib/moeda";
import { FichaTecnica } from "./FichaTecnica";
import { OpcoesProduto } from "./OpcoesProduto";
import { PizzaConfiguracao } from "./PizzaConfiguracao";
import { PizzaSaborFicha } from "./PizzaSaborFicha";

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
  // Sabor de pizza aberto na ficha da direita (nome vazio = novo sabor).
  // Só pizzas mostram a configuração de tamanhos e sabores; nos demais produtos ela fica escondida atrás de um botão.
  const [pizzaLiberadaPara, setPizzaLiberadaPara] = useState<string | null>(null);
  const [saborAberto, setSaborAberto] = useState<{ produtoId: string; nome: string } | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const categoriasDaLista = [...new Set(lista.map((produto) => produto.categoriaNome || "Sem categoria"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  // Agrupa por categoria (pizzas, calzones, pastéis...) para a lista ficar organizada.
  const listaFiltrada = lista
    .filter((produto) => !categoriaFiltro || (produto.categoriaNome || "Sem categoria") === categoriaFiltro)
    .filter((produto) => nomeProdutoComTamanho(produto).toLowerCase().includes(buscaProduto.trim().toLowerCase()) || (produto.pizzaSaboresLista ?? []).some((sabor) => sabor.nome.toLowerCase().includes(buscaProduto.trim().toLowerCase())))
    .sort((a, b) => (a.categoriaNome || "Sem categoria").localeCompare(b.categoriaNome || "Sem categoria", "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
  const [selecionadoIdManual, setSelecionadoIdManual] = useState("");
  const salvarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalImportarAberto, setModalImportarAberto] = useState(false);
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
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => setModalImportarAberto(true)}
          className="of-btn-secondary"
        >
          <Camera size={16} /> Importar do cardápio
        </button>
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
            <div className="space-y-2 px-3 pb-2">
              <input value={buscaProduto} onChange={(evento) => setBuscaProduto(evento.target.value)} placeholder="Buscar produto" aria-label="Buscar produto" className="of-field !min-h-10" />
              <div className="flex flex-wrap gap-1.5">
                {["", ...categoriasDaLista].map((categoria) => (
                  <button key={categoria || "todas"} type="button" aria-pressed={categoriaFiltro === categoria} onClick={() => setCategoriaFiltro(categoria)} className={`min-h-8 rounded-full border px-3 text-xs font-semibold transition ${categoriaFiltro === categoria ? "border-coral-500 bg-coral-050 text-coral-700" : "border-cream-300 bg-white text-ink-600 hover:border-coral-300"}`}>{categoria || "Todas"}</button>
                ))}
              </div>
            </div>
            <ul className="max-h-[420px] overflow-y-auto px-2 pb-2">
              {!listaFiltrada.length && <li className="px-3 py-6 text-center text-xs text-ink-500">Nenhum produto encontrado. Tente outra categoria ou busca.</li>}
              {listaFiltrada.map((produto, indice) => (
                <li key={produto.id}>
                  {(produto.categoriaNome || "Sem categoria") !== (listaFiltrada[indice - 1]?.categoriaNome || (indice ? "Sem categoria" : undefined)) && <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[.14em] text-coral-600">{produto.categoriaNome || "Sem categoria"}</p>}
                  <button
                    onClick={() => { setSelecionadoIdManual(produto.id); setSaborAberto(null); }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                      produto.id === selecionadoId ? "bg-coral-050 font-semibold text-coral-600" : "text-ink-600 hover:bg-cream-100"
                    }`}
                  >
                    <span>
                      {nomeProdutoComTamanho(produto)}
                      {produto.tipoProduto === "pizza" && <span className="ml-2 text-xs font-medium text-ink-400">{produto.pizzaSabores ?? 0} sabores{produto.pizzaTamanhos ? ` · ${produto.pizzaTamanhos}` : ""}</span>}
                    </span>
                    <span className="font-medium">R$ {produto.precoVenda.toFixed(2).replace(".", ",")}</span>
                  </button>
                  {produto.tipoProduto === "pizza" && !!produto.pizzaSaboresLista?.length && (
                    <ul className="mb-2 ml-4 border-l border-cream-200 pl-2">
                      {produto.pizzaSaboresLista
                        .filter((sabor) => !buscaProduto.trim() || sabor.nome.toLowerCase().includes(buscaProduto.trim().toLowerCase()) || nomeProdutoComTamanho(produto).toLowerCase().includes(buscaProduto.trim().toLowerCase()))
                        .map((sabor) => (
                          <li key={sabor.nome}>
                            <button onClick={() => { setSelecionadoIdManual(produto.id); setSaborAberto({ produtoId: produto.id, nome: sabor.nome }); }} className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition ${saborAberto?.produtoId === produto.id && saborAberto.nome.toLowerCase() === sabor.nome.toLowerCase() ? "bg-coral-050 font-semibold text-coral-700" : "text-ink-600 hover:bg-cream-100"}`}>
                              <span className="font-medium">{sabor.nome}</span>
                              <span className="shrink-0 text-ink-400">{Object.entries(sabor.precos).map(([tamanho, preco]) => `${tamanho} ${preco.toFixed(0)}`).join(" · ")}</span>
                            </button>
                          </li>
                        ))}
                      <li><button onClick={() => { setSelecionadoIdManual(produto.id); setSaborAberto({ produtoId: produto.id, nome: "" }); }} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-coral-600 hover:bg-coral-050"><Plus size={13} /> Novo sabor</button></li>
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {saborAberto && saborAberto.produtoId === selecionado.id ? (
            <PizzaSaborFicha key={`${saborAberto.produtoId}:${saborAberto.nome}`} produtoId={saborAberto.produtoId} nomeSabor={saborAberto.nome} onFechar={() => setSaborAberto(null)} onSalvo={(nomeFinal) => { recarregar(); setSaborAberto(nomeFinal ? { produtoId: saborAberto.produtoId, nome: nomeFinal } : null); }} />
          ) : (
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
              <label className={`group relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-ink-900 text-white outline-none transition hover:ring-2 hover:ring-coral-400 focus-within:ring-2 focus-within:ring-coral-400 ${enviandoImagem ? "cursor-wait opacity-70" : ""}`} style={selecionado.imagemUrl ? { backgroundImage: `url(${selecionado.imagemUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : { backgroundImage: "url(/menu-assets/ohfome-food-atlas.webp)", backgroundPosition: "0% 0%", backgroundSize: "300% 200%" }} aria-label="Trocar foto do produto" title="Clique para trocar a foto"><ImageIcon size={18} className={selecionado.imagemUrl ? "opacity-0" : "opacity-70"} /><span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1.5 text-center text-[10px] font-bold opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">{enviandoImagem ? "Enviando..." : "Trocar foto"}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={enviandoImagem} onChange={(e) => { void trocarImagem(e.target.files?.[0]); e.currentTarget.value = ""; }} className="sr-only" /></label>
              <div className="space-y-2">
                <input value={selecionado.nome} onChange={(e) => atualizarTexto("nome", e.target.value)} placeholder="Nome do produto" className="of-field" />
                <SeletorTamanho value={selecionado.tamanho ?? null} onChange={atualizarTamanho} compacto />
                <textarea value={selecionado.descricao ?? ""} onChange={(e) => atualizarTexto("descricao", e.target.value)} placeholder="Descrição que aparecerá no cardápio" rows={2} className="of-field resize-none" />
                <div className="relative"><Link2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" /><input value={selecionado.imagemUrl ?? ""} onChange={(e) => atualizarTexto("imagemUrl", e.target.value)} placeholder="ou cole a URL da foto" className="of-field !min-h-[46px] !pl-9" /></div>
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
            <OpcoesProduto produtoId={selecionado.id} />
            {selecionado.tipoProduto === "pizza" || pizzaLiberadaPara === selecionado.id
              ? <PizzaConfiguracao produtoId={selecionado.id} tipoProduto={selecionado.tipoProduto} onSalvo={recarregar} />
              : <button type="button" onClick={() => setPizzaLiberadaPara(selecionado.id)} className="mt-4 w-full rounded-2xl border border-dashed border-cream-300 px-4 py-3 text-left text-xs text-ink-500 transition hover:border-coral-300 hover:text-ink-700"><b className="block text-sm text-ink-700">Este produto é uma pizza?</b>Toque aqui para configurar tamanhos (P, M, G) e sabores. Os outros produtos não precisam disso.</button>}
          </div>
          )}
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

      {modalImportarAberto && (
        <ImportarCardapioModal
          onFechar={() => setModalImportarAberto(false)}
          onCriados={(ids) => {
            setModalImportarAberto(false);
            if (ids[0]) setSelecionadoIdManual(ids[0]);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

type EtapaImportacao = "selecionar" | "analisando" | "revisar" | "salvando";

interface ItemRevisao {
  chave: string;
  incluir: boolean;
  nome: string;
  tamanho: "P" | "M" | "G" | null;
  descricao: string;
  precoVenda: string;
  categoriaNome: string;
  tiposPao: string;
}
interface PizzaRevisao {
  chave: string; incluir: boolean; nome: string; categoriaNome: string; descricao: string;
  regraMeioAMeio: "maior_valor" | "media" | "preco_fixo";
  tamanhos: { nome: string; precoSaborUnico: number; precoMeioAMeio: number | null }[];
  sabores: { nome: string; descricao: string; acrescimo: number; precos?: Record<string, number> }[];
}

function ImportarCardapioModal({ onFechar, onCriados }: { onFechar: () => void; onCriados: (ids: string[]) => void }) {
  const { dados: categorias } = usePolling<Categoria[]>("/api/categorias", 60000);
  const [etapa, setEtapa] = useState<EtapaImportacao>("selecionar");
  const [arquivos, setArquivos] = useState<{ arquivo: File; preview: string }[]>([]);
  const urlsAtivos = useRef(new Set<string>());
  const previews = arquivos.map((item) => item.preview);
  const [itens, setItens] = useState<ItemRevisao[]>([]);
  const [pizzas, setPizzas] = useState<PizzaRevisao[]>([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const urls = urlsAtivos.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  function adicionarArquivos(lista: FileList | null) {
    if (!lista) return;
    setErro("");
    const novos = Array.from(lista).slice(0, Math.max(0, 12 - arquivos.length)).map((arquivo) => {
      const preview = URL.createObjectURL(arquivo);
      urlsAtivos.current.add(preview);
      return { arquivo, preview };
    });
    setArquivos((atual) => [...atual, ...novos].slice(0, 12));
  }

  function removerArquivo(indice: number) {
    const item = arquivos[indice];
    if (item) {
      URL.revokeObjectURL(item.preview);
      urlsAtivos.current.delete(item.preview);
    }
    setArquivos((atual) => atual.filter((_, i) => i !== indice));
  }

  async function analisar() {
    if (arquivos.length === 0) return;
    setErro("");
    setEtapa("analisando");
    const formData = new FormData();
    arquivos.forEach(({ arquivo }) => formData.append("arquivo", arquivo));
    const resposta = await fetch("/api/produtos/importar-cardapio", { method: "POST", body: formData });
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(corpo?.erro ?? "Não foi possível ler o cardápio.");
      setEtapa("selecionar");
      return;
    }
    const extraidos: { nome: string; tamanho: "P" | "M" | "G" | null; descricao: string; precoVenda: number; categoriaSugerida: string; tiposPao?: string[] }[] = corpo.itens ?? [];
    setItens(
      extraidos.slice().sort((a, b) => a.categoriaSugerida.localeCompare(b.categoriaSugerida, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR")).map((item, indice) => ({
        chave: `${indice}-${item.nome}`,
        incluir: true,
        nome: item.nome,
        tamanho: item.tamanho,
        descricao: item.descricao,
        precoVenda: item.precoVenda.toFixed(2).replace(".", ","),
        categoriaNome: item.categoriaSugerida,
        tiposPao: (item.tiposPao ?? []).join(", "),
      })),
    );
    const pizzasExtraidas: { nome: string; categoriaSugerida: string; descricao: string; regraMeioAMeio: PizzaRevisao["regraMeioAMeio"]; tamanhos: PizzaRevisao["tamanhos"]; sabores: PizzaRevisao["sabores"] }[] = corpo.pizzas ?? [];
    setPizzas(pizzasExtraidas.map((pizza, indice) => ({ chave: `pizza-${indice}-${pizza.nome}`, incluir: true, nome: pizza.nome, categoriaNome: pizza.categoriaSugerida, descricao: pizza.descricao, regraMeioAMeio: pizza.regraMeioAMeio, tamanhos: pizza.tamanhos, sabores: pizza.sabores })));
    setEtapa("revisar");
  }

  function atualizarItem(chave: string, campo: keyof ItemRevisao, valor: string | boolean | null) {
    setItens((atual) => atual.map((item) => (item.chave === chave ? { ...item, [campo]: valor } : item)));
  }

  function removerItem(chave: string) {
    setItens((atual) => atual.filter((item) => item.chave !== chave));
  }

  const selecionados = itens.filter((item) => item.incluir);
  const pizzasSelecionadas = pizzas.filter((pizza) => pizza.incluir);

  async function salvar() {
    if (selecionados.length + pizzasSelecionadas.length === 0) return;
    setErro("");
    setEtapa("salvando");
    const resposta = await fetch("/api/produtos/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: selecionados.map((item) => ({
          nome: item.nome,
          tamanho: item.tamanho,
          descricao: item.descricao,
          precoVenda: numeroDaMoeda(item.precoVenda),
          categoriaNome: item.categoriaNome,
          tiposPao: item.tiposPao.split(",").map((tipo) => tipo.trim()).filter(Boolean),
        })),
        pizzas: pizzasSelecionadas.map((pizza) => ({ nome: pizza.nome, categoriaNome: pizza.categoriaNome, descricao: pizza.descricao, regraMeioAMeio: pizza.regraMeioAMeio, tamanhos: pizza.tamanhos, sabores: pizza.sabores })),
      }),
    });
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(corpo?.erro ?? "Não foi possível criar os produtos.");
      setEtapa("revisar");
      return;
    }
    onCriados((corpo.produtos as { id: string }[]).map((produto) => produto.id));
  }

  return (
    <div className="of-modal-backdrop">
      <div className="of-modal-panel flex h-[min(90dvh,820px)] max-w-lg flex-col">
        <div className="of-panel-header bg-surface">
          <div>
            <p className="of-eyebrow">Cardápio</p>
            <p className="font-display text-lg font-bold text-ink-900">Importar do cardápio</p>
          </div>
          <button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {etapa === "selecionar" && (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-coral-200/60 bg-coral-050 p-3.5 text-xs leading-5 text-coral-700">
                <Sparkles size={16} className="mt-0.5 shrink-0" />
                <p>Tire uma foto (ou várias, se o cardápio tiver mais de uma página) e a IA identifica os pratos, ingredientes e preços automaticamente. Você confere e ajusta tudo antes de criar.</p>
              </div>

              <label className="flex min-h-[130px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-coral-300 bg-cream-50/70 text-center transition hover:bg-coral-050">
                <Upload size={22} className="text-coral-600" />
                <span className="text-sm font-semibold text-coral-700">Escolher fotos do cardápio</span>
                <span className="text-[11px] text-ink-400">JPG, PNG ou WebP · até 12 fotos</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => adicionarArquivos(e.target.files)} className="sr-only" />
              </label>

              {previews.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {previews.map((url, indice) => (
                    <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-cream-200 bg-cream-100">
                      <img src={url} alt={`Página ${indice + 1} do cardápio`} className="h-full w-full object-cover" />
                      <button
                        onClick={() => removerArquivo(indice)}
                        aria-label={`Remover foto ${indice + 1}`}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900/70 text-white opacity-0 transition group-hover:opacity-100"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {erro && <p className="rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-600">{erro}</p>}
            </>
          )}

          {etapa === "analisando" && (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-center">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-ink-900 text-white">
                <ScanLine size={28} className="animate-pulse" />
                <span className="pointer-events-none absolute inset-x-2 top-1/2 h-[2px] rounded-full bg-coral-400 shadow-[0_0_14px_2px_rgba(217,102,73,.7)] animate-[scan_1.8s_ease-in-out_infinite]" />
              </div>
              <div>
                <p className="font-display text-base font-bold text-ink-900">Lendo o cardápio...</p>
                <p className="mt-1 text-xs text-ink-400">Identificando pratos, ingredientes e preços.</p>
              </div>
              <style>{"@keyframes scan{0%,100%{transform:translateY(-18px)}50%{transform:translateY(18px)}}"}</style>
            </div>
          )}

          {(etapa === "revisar" || etapa === "salvando") && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-600">{itens.length} item(ns) e {pizzas.length} pizza(s) encontrada(s) · {selecionados.length + pizzasSelecionadas.length} selecionado(s)</p>
              </div>
              {pizzas.map((pizza) => <div key={pizza.chave} className="rounded-2xl border border-coral-200 bg-coral-050/50 p-3.5"><div className="flex items-start gap-2"><input type="checkbox" checked={pizza.incluir} onChange={() => setPizzas((atuais) => atuais.map((item) => item.chave === pizza.chave ? { ...item, incluir: !item.incluir } : item))} className="mt-1" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink-900">🍕 {pizza.nome}</p><p className="mt-1 text-xs text-ink-500">{pizza.categoriaNome} · meio a meio: {pizza.regraMeioAMeio === "maior_valor" ? "maior valor" : pizza.regraMeioAMeio === "media" ? "média" : "preço fixo"}</p><p className="mt-2 text-xs text-ink-700"><b>Tamanhos:</b> {pizza.tamanhos.map((tamanho) => `${tamanho.nome} R$ ${tamanho.precoSaborUnico.toFixed(2).replace(".", ",")}`).join(" · ")}</p><p className="mt-1 text-xs text-ink-700"><b>Sabores:</b> {pizza.sabores.map((sabor) => sabor.nome).join(" · ")}</p><p className="mt-2 text-[11px] text-ink-400">Após criar, você pode ajustar sabores, tamanhos e valores na edição do produto.</p></div></div></div>)}
              <div className="space-y-3">
                {itens.map((item, indice) => (
                  <div key={item.chave}>
                  {item.categoriaNome !== itens[indice - 1]?.categoriaNome && <p className="px-1 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[.14em] text-coral-600">{item.categoriaNome}</p>}
                  <div className={`rounded-2xl border p-3.5 transition ${item.incluir ? "border-coral-200/70 bg-surface" : "border-cream-200 bg-cream-50/60 opacity-60"}`}>
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => atualizarItem(item.chave, "incluir", !item.incluir)}
                        aria-pressed={item.incluir}
                        aria-label={item.incluir ? "Não incluir este item" : "Incluir este item"}
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${item.incluir ? "border-coral-500 bg-coral-500 text-white" : "border-cream-300 bg-surface text-transparent"}`}
                      >
                        <Check size={14} />
                      </button>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input value={item.nome} onChange={(e) => atualizarItem(item.chave, "nome", e.target.value)} placeholder="Nome do produto" className={`${CAMPO_CLASSE} !py-2 flex-1 font-semibold`} />
                          <select value={item.tamanho ?? ""} onChange={(e) => atualizarItem(item.chave, "tamanho", e.target.value || null)} className={`${CAMPO_CLASSE} !py-2 !w-20 !px-2 text-center`}>
                            <option value="">—</option>
                            <option value="P">P</option>
                            <option value="M">M</option>
                            <option value="G">G</option>
                          </select>
                        </div>
                        <input value={item.descricao} onChange={(e) => atualizarItem(item.chave, "descricao", e.target.value)} placeholder="Ingredientes / descrição" className={`${CAMPO_CLASSE} !py-2 text-xs`} />
                        <div className="flex gap-2">
                          <div className="flex min-h-[38px] flex-1 items-center rounded-xl border border-cream-200 bg-cream-50 px-2.5">
                            <span className="mr-1.5 text-xs font-bold text-ink-400">R$</span>
                            <input inputMode="decimal" value={item.precoVenda} onChange={(e) => atualizarItem(item.chave, "precoVenda", mascararMoeda(e.target.value))} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink-900 outline-none" />
                          </div>
                          <input value={item.categoriaNome} onChange={(e) => atualizarItem(item.chave, "categoriaNome", e.target.value)} placeholder="Categoria" list="categorias-existentes" className={`${CAMPO_CLASSE} !py-2 flex-1 text-xs`} />
                        </div>
                        <input value={item.tiposPao} onChange={(e) => atualizarItem(item.chave, "tiposPao", e.target.value)} placeholder="Tipos de pão (ex.: Bola, Brioche, Árabe) — deixe vazio se não houver" className={`${CAMPO_CLASSE} !py-2 text-xs`} />
                      </div>
                      <button onClick={() => removerItem(item.chave)} aria-label="Remover item" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-400 transition hover:bg-danger-050 hover:text-danger-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div></div>
                ))}
              </div>
              <datalist id="categorias-existentes">
                {(categorias ?? []).map((categoria) => <option key={categoria.id} value={categoria.nome} />)}
              </datalist>
              {erro && <p className="rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-600">{erro}</p>}
            </>
          )}
        </div>

        <footer className="border-t border-cream-200 bg-surface p-4">
          <div className="mx-auto max-w-sm">
            {etapa === "selecionar" && (
              <button onClick={analisar} disabled={arquivos.length === 0} className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40" style={{ background: GRADIENTE_CORAL }}>
                <Sparkles size={16} /> Analisar {arquivos.length > 0 ? `${arquivos.length} foto(s)` : "cardápio"}
              </button>
            )}
            {(etapa === "revisar" || etapa === "salvando") && (
              <button onClick={salvar} disabled={selecionados.length + pizzasSelecionadas.length === 0 || etapa === "salvando"} className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40" style={{ background: GRADIENTE_CORAL }}>
                {etapa === "salvando" ? <><Loader2 size={16} className="animate-spin" /> Criando produtos...</> : `Adicionar ${selecionados.length + pizzasSelecionadas.length} produto(s)`}
              </button>
            )}
          </div>
        </footer>
      </div>
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
  const [controlaEstoqueUnidades, setControlaEstoqueUnidades] = useState(false);
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
    if (controlaEstoqueUnidades) {
      await fetch("/api/estoque/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: produto.id, acao: "configurar", ativo: true, saldoInicial: 0 }),
      }).catch(() => null);
    }
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
      <div className="of-modal-panel flex h-[min(90dvh,820px)] max-w-md flex-col">
        <div className="of-panel-header bg-surface">
          <div><p className="of-eyebrow">Cardápio</p><p className="font-display text-lg font-bold text-ink-900">Novo produto</p></div>
          <button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <section className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-ink-400">Informações do item</p>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Nome do produto</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pizza Calabresa" className={CAMPO_CLASSE} /></label>
            <SeletorTamanho value={tamanho} onChange={setTamanho} />
            <label className="flex items-start gap-2.5 rounded-xl border border-cream-200 bg-cream-50/70 p-3">
              <input type="checkbox" checked={controlaEstoqueUnidades} onChange={(e) => setControlaEstoqueUnidades(e.target.checked)} className="mt-0.5" />
              <span className="text-xs leading-5 text-ink-600"><span className="font-semibold text-ink-900">Produto vendido por unidade</span> (ex.: lata, garrafa). A quantidade é controlada em Estoque → Produtos por unidade e o item fica &quot;esgotado&quot; sozinho quando acabar.</span>
            </label>
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
