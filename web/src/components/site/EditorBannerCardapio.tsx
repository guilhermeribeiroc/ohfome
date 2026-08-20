"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, LoaderCircle, MonitorPlay, Trash2, Upload } from "lucide-react";
import type { BannerCardapio, ModoBannerCardapio } from "@/lib/types";

const MODOS: { id: ModoBannerCardapio; titulo: string; descricao: string }[] = [
  { id: "padrao", titulo: "Visual padrão", descricao: "Usa o fundo ilustrado do OhFome." },
  { id: "fixo", titulo: "Imagem fixa", descricao: "Uma foto de destaque do restaurante." },
  { id: "carrossel", titulo: "Carrossel", descricao: "Até cinco fotos alternando no topo." },
];

type DadosBanner = { modo: ModoBannerCardapio; banners: BannerCardapio[] };

export function EditorBannerCardapio() {
  const [dados, setDados] = useState<DadosBanner>({ modo: "padrao", banners: [] });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const resposta = await fetch("/api/estabelecimento/banners");
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(corpo?.erro ?? "Não foi possível carregar o banner.");
      setDados({ modo: corpo.modo, banners: corpo.banners ?? [] });
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível carregar o banner.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const inicio = window.setTimeout(() => { void carregar(); }, 0);
    return () => window.clearTimeout(inicio);
  }, []);

  async function mudarModo(modo: ModoBannerCardapio) {
    setSalvando(true); setErro("");
    try {
      const resposta = await fetch("/api/estabelecimento/banners", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo }) });
      if (!resposta.ok) throw new Error((await resposta.json().catch(() => null))?.erro ?? "Não foi possível salvar o modo.");
      setDados((atual) => ({ ...atual, modo }));
    } catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível salvar o modo."); }
    finally { setSalvando(false); }
  }

  async function enviar(arquivo: File | undefined) {
    if (!arquivo || dados.banners.length >= 5) return;
    setSalvando(true); setErro("");
    try {
      const formulario = new FormData(); formulario.append("arquivo", arquivo);
      const upload = await fetch("/api/uploads/banner", { method: "POST", body: formulario });
      const arquivoEnviado = await upload.json().catch(() => null);
      if (!upload.ok) throw new Error(arquivoEnviado?.erro ?? "Não foi possível enviar a imagem.");
      const resposta = await fetch("/api/estabelecimento/banners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: arquivoEnviado.url }) });
      const banner = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(banner?.erro ?? "Não foi possível salvar a imagem.");
      setDados((atual) => ({ ...atual, banners: [...atual.banners, banner] }));
    } catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível enviar a imagem."); }
    finally { setSalvando(false); }
  }

  async function remover(id: string) {
    setSalvando(true); setErro("");
    try {
      const resposta = await fetch(`/api/estabelecimento/banners/${id}`, { method: "DELETE" });
      if (!resposta.ok) throw new Error((await resposta.json().catch(() => null))?.erro ?? "Não foi possível remover a imagem.");
      await carregar();
    } catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível remover a imagem."); }
    finally { setSalvando(false); }
  }

  async function mover(banner: BannerCardapio, direcao: -1 | 1) {
    const destino = banner.ordem + direcao;
    if (destino < 0 || destino >= dados.banners.length) return;
    setSalvando(true); setErro("");
    try {
      const resposta = await fetch(`/api/estabelecimento/banners/${banner.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem: destino }) });
      if (!resposta.ok) throw new Error((await resposta.json().catch(() => null))?.erro ?? "Não foi possível reordenar as imagens.");
      await carregar();
    } catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível reordenar as imagens."); }
    finally { setSalvando(false); }
  }

  return <section className="mb-6 overflow-hidden rounded-[1.4rem] border border-ink-200/80 bg-white shadow-sm">
    <div className="flex items-start gap-3 border-b border-ink-100 p-5 sm:p-6"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-050 text-coral-600"><MonitorPlay size={19} /></span><div><h2 className="font-display text-lg font-semibold tracking-[-.035em]">Aparência do cardápio</h2><p className="mt-0.5 text-xs leading-5 text-ink-500">Personalize a foto de destaque que aparece no topo do seu link público.</p></div></div>
    <div className="space-y-4 p-5 sm:p-6">
      <div className="grid gap-2 sm:grid-cols-3">{MODOS.map((modo) => <button key={modo.id} disabled={salvando} onClick={() => void mudarModo(modo.id)} className={`rounded-xl border p-3 text-left transition ${dados.modo === modo.id ? "border-coral-500 bg-coral-050 ring-1 ring-coral-200" : "border-cream-200 bg-cream-50 hover:border-ink-300"}`}><strong className="block text-sm text-ink-900">{modo.titulo}</strong><span className="mt-1 block text-[11px] leading-4 text-ink-500">{modo.descricao}</span></button>)}</div>
      <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-ink-700">Fotos do banner <span className="font-normal text-ink-400">({dados.banners.length}/5)</span></p><label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-xs font-semibold transition ${dados.banners.length >= 5 || salvando ? "cursor-not-allowed bg-cream-100 text-ink-400" : "bg-ink-900 text-white hover:bg-ink-800"}`}><Upload size={14} />{salvando ? "Salvando..." : "Enviar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={salvando || dados.banners.length >= 5} onChange={(evento) => { void enviar(evento.target.files?.[0]); evento.currentTarget.value = ""; }} /></label></div>
      {carregando ? <div className="flex min-h-28 items-center justify-center text-ink-400"><LoaderCircle size={20} className="animate-spin" /></div> : dados.banners.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dados.banners.map((banner, indice) => <article key={banner.id} className="overflow-hidden rounded-xl border border-cream-200 bg-cream-50"><img src={banner.url} alt={`Banner ${indice + 1}`} className="aspect-video w-full object-cover" /><div className="flex items-center justify-between p-2"><span className="text-[11px] font-semibold text-ink-500">Foto {indice + 1}</span><div className="flex items-center gap-1"><button disabled={salvando || indice === 0} onClick={() => void mover(banner, -1)} className="of-icon-btn !h-8 !min-h-8 !w-8 disabled:opacity-30" aria-label="Mover foto para cima"><ArrowUp size={14} /></button><button disabled={salvando || indice === dados.banners.length - 1} onClick={() => void mover(banner, 1)} className="of-icon-btn !h-8 !min-h-8 !w-8 disabled:opacity-30" aria-label="Mover foto para baixo"><ArrowDown size={14} /></button><button disabled={salvando} onClick={() => void remover(banner.id)} className="of-icon-btn !h-8 !min-h-8 !w-8 text-danger-600 disabled:opacity-30" aria-label="Remover foto"><Trash2 size={14} /></button></div></div></article>)}</div> : <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-cream-300 bg-cream-50 text-center"><ImagePlus size={20} className="text-ink-400" /><p className="mt-2 text-xs text-ink-500">Envie uma foto do restaurante, prato ou ambiente.</p></div>}
      <p className="text-[11px] leading-5 text-ink-400">JPG, PNG ou WebP, até 5 MB. O cardápio aplica contraste automático para os textos continuarem legíveis.</p>{erro && <p className="text-xs text-danger-600">{erro}</p>}
    </div>
  </section>;
}
