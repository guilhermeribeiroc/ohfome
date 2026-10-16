"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Loader2, Search, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import type { Produto } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { CategoriaChips, CategoriaColuna } from "@/components/ui/CategoriaChips";
import { Interruptor } from "./PizzaConfiguracao";
import { ehImagemAceita, reduzirImagem } from "@/lib/imagem-cliente";
import { casarPorNome } from "@/lib/casar-fotos";

// Um item da grade: um produto comum, ou UM sabor de pizza (cada sabor aparece como item no cardápio).
type ItemFoto = { chave: string; produtoId: string; saborId?: string; nome: string; categoria: string; imagemUrl: string | null };
type Proposta = { id: string; arquivo: File; preview: string; nomeOriginal: string; chave: string | null; origem: "nome" | "ia" | "voce" | null; confianca?: number };

async function enviarArquivo(arquivo: File): Promise<string> {
  const formData = new FormData();
  formData.append("arquivo", arquivo);
  const resposta = await fetch("/api/uploads/produto", { method: "POST", body: formData });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok || !dados?.url) throw new Error(dados?.erro ?? "Não foi possível enviar a foto.");
  return dados.url as string;
}

async function atribuirFoto(item: ItemFoto, url: string | null) {
  const resposta = item.saborId
    ? await fetch(`/api/pizzas/sabores/${item.saborId}/imagem`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imagemUrl: url }) })
    : await fetch(`/api/produtos/${item.produtoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imagemUrl: url }) });
  if (!resposta.ok) { const dados = await resposta.json().catch(() => null); throw new Error(dados?.erro ?? "Não foi possível salvar a foto."); }
}

function CartaoFoto({ item, ocupado, onArquivos, onRemover }: { item: ItemFoto; ocupado: boolean; onArquivos: (arquivos: File[]) => void; onRemover: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  return <div tabIndex={0} aria-label={`Foto de ${item.nome}`}
    onPaste={(evento) => { const arquivos = [...evento.clipboardData.files].filter(ehImagemAceita); if (arquivos.length) { evento.preventDefault(); onArquivos(arquivos); } }}
    onDragOver={(evento) => { evento.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
    onDrop={(evento) => { evento.preventDefault(); setArrastando(false); onArquivos([...evento.dataTransfer.files].filter(ehImagemAceita)); }}
    className={`group relative overflow-hidden rounded-2xl border bg-white outline-none transition focus-visible:ring-2 focus-visible:ring-coral-400 ${arrastando ? "border-coral-500 ring-2 ring-coral-300" : "border-cream-200 hover:border-coral-300"}`}>
    <button type="button" onClick={() => entrada.current?.click()} disabled={ocupado} className="relative block aspect-[4/3] w-full overflow-hidden bg-cream-100 text-left">
      {item.imagemUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={item.imagemUrl} alt={item.nome} loading="lazy" className="h-full w-full object-cover" />
        : <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-400"><Camera size={22} /><span className="text-[11px] font-semibold">Adicionar foto</span></span>}
      <span className="absolute inset-0 flex items-center justify-center bg-ink-900/55 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">{item.imagemUrl ? "Trocar foto" : "Escolher foto"}</span>
      {ocupado && <span className="absolute inset-0 flex items-center justify-center bg-white/70"><Loader2 className="animate-spin text-ink-700" size={22} /></span>}
    </button>
    <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(evento) => { const arquivos = [...(evento.target.files ?? [])]; evento.target.value = ""; onArquivos(arquivos); }} />
    <div className="px-3 py-2"><p className="truncate text-[13px] font-semibold text-ink-900">{item.nome}</p><p className="truncate text-[11px] text-ink-400">{item.categoria}</p></div>
    {item.imagemUrl && !ocupado && <button type="button" onClick={onRemover} aria-label={`Remover a foto de ${item.nome}`} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-danger-600 opacity-0 shadow transition hover:bg-white group-hover:opacity-100 focus-visible:opacity-100"><Trash2 size={14} /></button>}
  </div>;
}

export function FotosProdutos() {
  const { dados, recarregar } = usePolling<Produto[]>("/api/produtos", 60000);
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [soSemFoto, setSoSemFoto] = useState(false);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState("");
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [identificando, setIdentificando] = useState<{ feito: number; total: number } | null>(null);
  const [aplicando, setAplicando] = useState<{ feito: number; total: number } | null>(null);
  const [erroLote, setErroLote] = useState("");
  const entradaLote = useRef<HTMLInputElement>(null);
  const [arrastandoLote, setArrastandoLote] = useState(false);

  const itens = useMemo<ItemFoto[]>(() => (dados ?? []).flatMap((produto) => {
    const categoriaNome = produto.categoriaNome || "Sem categoria";
    if (produto.tipoProduto === "pizza" && produto.pizzaSaboresLista?.length) {
      return produto.pizzaSaboresLista.map((sabor) => ({ chave: `s:${sabor.id}`, produtoId: produto.id, saborId: sabor.id, nome: sabor.nome, categoria: categoriaNome, imagemUrl: sabor.imagemUrl ?? null }));
    }
    return [{ chave: `p:${produto.id}`, produtoId: produto.id, nome: produto.nome + (produto.tamanho ? ` (${produto.tamanho})` : ""), categoria: categoriaNome, imagemUrl: produto.imagemUrl ?? null }];
  }), [dados]);

  const categorias = useMemo(() => [...new Set(itens.map((item) => item.categoria))], [itens]);
  const itensCategorias = useMemo(() => [{ valor: "", rotulo: "Todas", quantidade: itens.length }, ...categorias.map((nome) => ({ valor: nome, rotulo: nome, quantidade: itens.filter((item) => item.categoria === nome).length }))], [itens, categorias]);
  const comFoto = itens.filter((item) => item.imagemUrl).length;
  const visiveis = itens.filter((item) => (!categoria || item.categoria === categoria) && (!soSemFoto || !item.imagemUrl) && item.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const itemPorChave = useMemo(() => new Map(itens.map((item) => [item.chave, item])), [itens]);

  function marcarOcupado(chave: string, ligado: boolean) {
    setOcupados((atual) => { const novo = new Set(atual); if (ligado) novo.add(chave); else novo.delete(chave); return novo; });
  }

  // ---- foto de UM item (toque, arrastar ou colar) ----
  async function salvarUma(item: ItemFoto, arquivos: File[]) {
    if (!arquivos.length) return;
    if (arquivos.length > 1) { void prepararLote(arquivos); return; }
    setAviso(""); marcarOcupado(item.chave, true);
    try {
      const url = await enviarArquivo(await reduzirImagem(arquivos[0]));
      await atribuirFoto(item, url);
      recarregar();
    } catch (erro) { setAviso(erro instanceof Error ? erro.message : "Não foi possível salvar a foto."); }
    finally { marcarOcupado(item.chave, false); }
  }

  async function removerUma(item: ItemFoto) {
    marcarOcupado(item.chave, true);
    try { await atribuirFoto(item, null); recarregar(); }
    catch (erro) { setAviso(erro instanceof Error ? erro.message : "Não foi possível remover a foto."); }
    finally { marcarOcupado(item.chave, false); }
  }

  // ---- várias fotos de uma vez ----
  async function prepararLote(arquivos: File[]) {
    const aceitos = arquivos.filter(ehImagemAceita);
    if (!aceitos.length) { setAviso("Use fotos JPG, PNG ou WebP."); return; }
    setPreparando(true); setErroLote(""); setAviso(arquivos.length > aceitos.length ? `${arquivos.length - aceitos.length} arquivo(s) ignorado(s): só JPG, PNG e WebP.` : "");
    const novas: Proposta[] = [];
    const paraCasar = itens.map((item) => ({ chave: item.chave, nome: item.nome, categoria: item.categoria }));
    for (const arquivo of aceitos) {
      try {
        const reduzido = await reduzirImagem(arquivo);
        const chave = casarPorNome(arquivo.name, paraCasar);
        novas.push({ id: crypto.randomUUID(), arquivo: reduzido, preview: URL.createObjectURL(reduzido), nomeOriginal: arquivo.name, chave, origem: chave ? "nome" : null });
      } catch { setAviso(`Não consegui ler "${arquivo.name}". Fotos HEIC do iPhone precisam ser convertidas para JPG.`); }
    }
    setPropostas((atuais) => [...atuais, ...novas]);
    setPreparando(false);
  }

  function limparLote() { propostas.forEach((proposta) => URL.revokeObjectURL(proposta.preview)); setPropostas([]); setErroLote(""); }

  async function identificarComIA() {
    const pendentes = propostas.filter((proposta) => !proposta.chave);
    if (!pendentes.length) return;
    setErroLote(""); setIdentificando({ feito: 0, total: pendentes.length });
    try {
      for (let inicio = 0; inicio < pendentes.length; inicio += 6) {
        const lote = pendentes.slice(inicio, inicio + 6);
        const formData = new FormData();
        lote.forEach((proposta) => formData.append("arquivo", proposta.arquivo));
        const resposta = await fetch("/api/produtos/fotos/identificar", { method: "POST", body: formData });
        const corpo = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(corpo?.erro ?? "Não foi possível identificar as fotos.");
        const resultados = (corpo?.resultados ?? []) as { indice: number; itemId: string | null; confianca: number }[];
        setPropostas((atuais) => atuais.map((proposta) => {
          const posicao = lote.findIndex((item) => item.id === proposta.id);
          const resultado = resultados.find((entrada) => entrada.indice === posicao);
          // Abaixo de 50% a IA está chutando: deixa sem par para o dono escolher.
          return resultado?.itemId && resultado.confianca >= 0.5 && itemPorChave.has(resultado.itemId) ? { ...proposta, chave: resultado.itemId, origem: "ia", confianca: resultado.confianca } : proposta;
        }));
        setIdentificando({ feito: Math.min(inicio + 6, pendentes.length), total: pendentes.length });
      }
    } catch (erro) { setErroLote(erro instanceof Error ? erro.message : "Não foi possível identificar as fotos."); }
    finally { setIdentificando(null); }
  }

  async function aplicarTudo() {
    const prontas = propostas.filter((proposta) => proposta.chave && itemPorChave.has(proposta.chave));
    if (!prontas.length) return;
    setErroLote(""); setAplicando({ feito: 0, total: prontas.length });
    const falhas: string[] = []; const salvas = new Set<string>();
    let feito = 0;
    // 3 envios ao mesmo tempo: rápido sem sobrecarregar o servidor.
    const fila = [...prontas];
    async function trabalhador() {
      for (let proposta = fila.shift(); proposta; proposta = fila.shift()) {
        const item = itemPorChave.get(proposta.chave as string)!;
        try { await atribuirFoto(item, await enviarArquivo(proposta.arquivo)); salvas.add(proposta.id); }
        catch (erro) { falhas.push(`${item.nome}: ${erro instanceof Error ? erro.message : "falhou"}`); }
        feito += 1; setAplicando({ feito, total: prontas.length });
      }
    }
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    setAplicando(null); recarregar();
    setPropostas((atuais) => { atuais.filter((proposta) => salvas.has(proposta.id)).forEach((proposta) => URL.revokeObjectURL(proposta.preview)); return atuais.filter((proposta) => !salvas.has(proposta.id)); });
    if (falhas.length) setErroLote(`${falhas.length} foto(s) não foram salvas: ${falhas.slice(0, 3).join(" · ")}`);
    else setAviso(`${salvas.size} foto(s) salvas.`);
  }

  const associadas = propostas.filter((proposta) => proposta.chave).length;
  const semPar = propostas.length - associadas;
  const repetidas = new Set(propostas.filter((proposta) => proposta.chave).map((proposta) => proposta.chave).filter((chave, indice, todas) => todas.indexOf(chave) !== indice));
  const porcentagem = itens.length ? Math.round((comFoto / itens.length) * 100) : 0;

  return <section className="of-panel overflow-hidden">
    <header className="border-b border-cream-100 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><p className="font-display text-lg font-bold text-ink-900">Fotos dos produtos</p>
          <p className="mt-1 text-xs leading-5 text-ink-500">Toque num quadrado para escolher a foto, arraste uma foto para cima dele ou cole com Ctrl+V. Para muitas fotos de uma vez, use a área abaixo.</p></div>
        <div className="w-full sm:w-56"><div className="flex items-center justify-between text-[11px] font-semibold text-ink-600"><span>{comFoto} de {itens.length} com foto</span><span>{porcentagem}%</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${porcentagem}%` }} /></div></div>
      </div>
      <div onDragOver={(evento) => { evento.preventDefault(); setArrastandoLote(true); }} onDragLeave={() => setArrastandoLote(false)}
        onDrop={(evento) => { evento.preventDefault(); setArrastandoLote(false); void prepararLote([...evento.dataTransfer.files]); }}
        className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${arrastandoLote ? "border-coral-500 bg-coral-050" : "border-cream-300 bg-cream-50/60"}`}>
        {preparando ? <><Loader2 className="animate-spin text-ink-500" size={22} /><p className="text-sm font-semibold text-ink-700">Preparando as fotos...</p></> : <>
          <ImagePlus size={24} className="text-coral-600" />
          <p className="text-sm font-bold text-ink-900">Arraste várias fotos aqui</p>
          <p className="max-w-md text-xs leading-5 text-ink-500">O sistema liga cada foto ao produto pelo nome do arquivo (<b>calabresa.jpg</b> vai para Calabresa). As que ele não reconhecer, a IA tenta identificar, e você confere tudo antes de salvar.</p>
          <button type="button" onClick={() => entradaLote.current?.click()} className="of-btn-secondary !min-h-10 !px-4 !text-xs">Escolher fotos</button></>}
        <input ref={entradaLote} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={(evento) => { const arquivos = [...(evento.target.files ?? [])]; evento.target.value = ""; void prepararLote(arquivos); }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1"><Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar produto" aria-label="Buscar produto" className="of-field !min-h-10 !pl-9" /></div>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-700">Só sem foto <Interruptor marcado={soSemFoto} onChange={setSoSemFoto} rotulo="Mostrar só os produtos sem foto" /></label>
      </div>
      <div className="mt-3 lg:hidden"><CategoriaChips itens={itensCategorias} valor={categoria} onChange={setCategoria} /></div>
      {aviso && <p className="mt-3 rounded-xl bg-cream-50 px-3 py-2 text-xs font-medium text-ink-700" role="status">{aviso}</p>}
    </header>
    <div className="lg:flex">
      <aside className="hidden w-52 shrink-0 border-r border-cream-100 p-3 lg:block"><div className="sticky top-3 max-h-[70dvh] overflow-y-auto"><CategoriaColuna itens={itensCategorias} valor={categoria} onChange={setCategoria} /></div></aside>
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        {!dados ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-ink-400" size={22} /></div>
          : !visiveis.length ? <p className="py-10 text-center text-sm text-ink-500">{soSemFoto && !busca && !categoria ? "Todos os produtos já têm foto." : "Nenhum produto encontrado. Tente outra categoria ou busca."}</p>
          : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{visiveis.map((item) => <CartaoFoto key={item.chave} item={item} ocupado={ocupados.has(item.chave)} onArquivos={(arquivos) => void salvarUma(item, arquivos)} onRemover={() => void removerUma(item)} />)}</div>}
      </div>
    </div>

    {propostas.length > 0 && <div className="of-modal-backdrop z-50" role="dialog" aria-modal="true" aria-label="Conferir fotos">
      <section className="of-modal-panel flex h-[min(90dvh,820px)] max-w-3xl flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b border-cream-200 p-5">
          <div><p className="of-eyebrow">Conferir antes de salvar</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">{propostas.length} {propostas.length === 1 ? "foto" : "fotos"} · {associadas} com produto{semPar ? ` · ${semPar} sem par` : ""}</h2></div>
          <button type="button" onClick={limparLote} disabled={!!aplicando} className="of-icon-btn" aria-label="Cancelar e fechar"><X size={17} /></button>
        </header>
        <div className="flex flex-wrap items-center gap-2 border-b border-cream-100 bg-cream-50/60 px-5 py-3">
          <button type="button" onClick={() => void identificarComIA()} disabled={!semPar || !!identificando || !!aplicando} className="of-btn-secondary !min-h-10 !px-4 !text-xs">{identificando ? <><Loader2 size={14} className="animate-spin" /> Identificando {identificando.feito}/{identificando.total}...</> : <><Sparkles size={14} /> Identificar as {semPar || ""} sem par com IA</>}</button>
          <button type="button" onClick={() => entradaLote.current?.click()} disabled={!!aplicando} className="text-xs font-semibold text-coral-700 hover:text-coral-800">+ Adicionar mais fotos</button>
        </div>
        {erroLote && <p className="mx-5 mt-3 rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-700" role="alert">{erroLote}</p>}
        <ul className="min-h-0 flex-1 divide-y divide-cream-100 overflow-y-auto px-5">
          {propostas.map((proposta) => <li key={proposta.id} className="flex items-center gap-3 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proposta.preview} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-ink-400">{proposta.nomeOriginal}</p>
              <select value={proposta.chave ?? ""} onChange={(evento) => setPropostas((atuais) => atuais.map((item) => item.id === proposta.id ? { ...item, chave: evento.target.value || null, origem: evento.target.value ? "voce" : null, confianca: undefined } : item))} disabled={!!aplicando} className={`of-field mt-1 !min-h-10 ${!proposta.chave ? "!border-amber-400" : ""}`} aria-label={`Produto da foto ${proposta.nomeOriginal}`}>
                <option value="">Sem par: escolha o produto</option>
                {categorias.map((nome) => <optgroup key={nome} label={nome}>{itens.filter((item) => item.categoria === nome).map((item) => <option key={item.chave} value={item.chave}>{item.nome}</option>)}</optgroup>)}
              </select>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold">
                {proposta.origem === "nome" && <span className="text-emerald-700"><Check size={11} className="mr-0.5 inline" />Pelo nome do arquivo</span>}
                {proposta.origem === "ia" && <span className={(proposta.confianca ?? 0) >= 0.8 ? "text-emerald-700" : "text-amber-700"}><Sparkles size={11} className="mr-0.5 inline" />IA {Math.round((proposta.confianca ?? 0) * 100)}%{(proposta.confianca ?? 0) < 0.8 ? " · confira" : ""}</span>}
                {proposta.origem === "voce" && <span className="text-ink-500">Escolhido por você</span>}
                {proposta.chave && repetidas.has(proposta.chave) && <span className="text-amber-700"><TriangleAlert size={11} className="mr-0.5 inline" />Outra foto no mesmo produto: vale a última</span>}
                {proposta.chave && itemPorChave.get(proposta.chave)?.imagemUrl && <span className="text-ink-400">Troca a foto atual</span>}
              </p>
            </div>
            <button type="button" onClick={() => { URL.revokeObjectURL(proposta.preview); setPropostas((atuais) => atuais.filter((item) => item.id !== proposta.id)); }} disabled={!!aplicando} className="of-icon-btn shrink-0 text-danger-600" aria-label={`Tirar a foto ${proposta.nomeOriginal} da lista`}><Trash2 size={15} /></button>
          </li>)}
        </ul>
        <footer className="border-t border-cream-200 bg-surface p-4">
          {aplicando && <div className="mb-3"><div className="h-2 overflow-hidden rounded-full bg-cream-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((aplicando.feito / aplicando.total) * 100)}%` }} /></div><p className="mt-1 text-[11px] font-semibold text-ink-500">Salvando {aplicando.feito} de {aplicando.total}...</p></div>}
          <button type="button" onClick={() => void aplicarTudo()} disabled={!associadas || !!aplicando || !!identificando} className="of-btn-primary w-full">{aplicando ? <><Loader2 className="animate-spin" size={15} />Salvando fotos...</> : `Aplicar ${associadas} ${associadas === 1 ? "foto" : "fotos"}${semPar ? ` (${semPar} ficam de fora)` : ""}`}</button>
        </footer>
      </section>
    </div>}
  </section>;
}
