"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/pedidos/KanbanBoard";
import { PrecificacaoCalculadora } from "@/components/estoque/PrecificacaoCalculadora";
import { useTenant } from "@/lib/tenant-context";
import { Check, Clipboard, ExternalLink, Globe2, ImagePlus, Link2, MessageCircle, PackageOpen, Trash2, Upload } from "lucide-react";

const ABAS = [
  { id: "pedidos", label: "Pedidos do site" },
  { id: "produtos", label: "Produtos do cardápio" },
] as const;

export function SiteModule() {
  const { estabelecimento } = useTenant();
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("pedidos");
  const [copiado, setCopiado] = useState(false);
  const [origem] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [logoUrl, setLogoUrl] = useState("");
  const [logoDigitada, setLogoDigitada] = useState("");
  const [carregandoLogo, setCarregandoLogo] = useState(true);
  const [salvandoLogo, setSalvandoLogo] = useState(false);
  const [erroLogo, setErroLogo] = useState("");
  const [whatsappAtendimento, setWhatsappAtendimento] = useState("");
  const [salvandoWhatsapp, setSalvandoWhatsapp] = useState(false);
  const [erroWhatsapp, setErroWhatsapp] = useState("");

  const link = estabelecimento ? `${origem}/cardapio/${estabelecimento.slug}` : "";

  useEffect(() => {
    fetch("/api/estabelecimento/logo")
      .then(async (resposta) => {
        const dados = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível carregar a logo.");
        const url = dados?.logoUrl ?? "";
        setLogoUrl(url);
        setLogoDigitada(url);
      })
      .catch((erro: unknown) => setErroLogo(erro instanceof Error ? erro.message : "Não foi possível carregar a logo."))
      .finally(() => setCarregandoLogo(false));
  }, []);

  useEffect(() => {
    fetch("/api/estabelecimento/whatsapp")
      .then(async (resposta) => {
        const dados = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível carregar o WhatsApp.");
        setWhatsappAtendimento(dados?.whatsappAtendimento ?? "");
      })
      .catch((erro: unknown) => setErroWhatsapp(erro instanceof Error ? erro.message : "Não foi possível carregar o WhatsApp."));
  }, []);

  async function salvarLogo(url: string) {
    setSalvandoLogo(true);
    setErroLogo("");
    try {
      const resposta = await fetch("/api/estabelecimento/logo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logoUrl: url }) });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível salvar a logo.");
      const logo = dados?.logoUrl ?? "";
      setLogoUrl(logo);
      setLogoDigitada(logo);
    } catch (erro) {
      setErroLogo(erro instanceof Error ? erro.message : "Não foi possível salvar a logo.");
    } finally {
      setSalvandoLogo(false);
    }
  }

  async function enviarLogo(arquivo: File | undefined) {
    if (!arquivo) return;
    setSalvandoLogo(true);
    setErroLogo("");
    try {
      const formulario = new FormData();
      formulario.append("arquivo", arquivo);
      const envio = await fetch("/api/uploads/logo", { method: "POST", body: formulario });
      const dados = await envio.json().catch(() => null);
      if (!envio.ok) throw new Error(dados?.erro ?? "Não foi possível enviar a logo.");
      const resposta = await fetch("/api/estabelecimento/logo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logoUrl: dados?.url }) });
      const logo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(logo?.erro ?? "Não foi possível salvar a logo.");
      const url = logo?.logoUrl ?? "";
      setLogoUrl(url);
      setLogoDigitada(url);
    } catch (erro) {
      setErroLogo(erro instanceof Error ? erro.message : "Não foi possível atualizar a logo.");
    } finally {
      setSalvandoLogo(false);
    }
  }

  async function salvarWhatsapp() {
    setSalvandoWhatsapp(true);
    setErroWhatsapp("");
    try {
      const resposta = await fetch("/api/estabelecimento/whatsapp", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappAtendimento }) });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível salvar o WhatsApp.");
      setWhatsappAtendimento(dados?.whatsappAtendimento ?? "");
    } catch (erro) {
      setErroWhatsapp(erro instanceof Error ? erro.message : "Não foi possível salvar o WhatsApp.");
    } finally {
      setSalvandoWhatsapp(false);
    }
  }

  function copiarLink() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="of-page">
      <div className="of-page-header">
        <div><p className="of-eyebrow">Canal próprio</p><h1 className="of-title">Cardápio Digital</h1>
        <p className="of-subtitle">Seu link público para bio, WhatsApp e QR code, sem intermediários.</p></div>
      </div>

      <div
        className="relative mb-6 flex flex-col gap-4 overflow-hidden rounded-[1.4rem] bg-ink-900 p-5 text-white shadow-xl shadow-ink-900/15 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-coral-500/20 blur-3xl" />
        <div className="relative flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-coral-400 ring-1 ring-white/10"><Globe2 size={20} /></span><div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-white/45">Seu link público</p>
          <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 truncate text-sm font-semibold text-white hover:text-coral-400">
            {link || "Carregando..."}
            <ExternalLink size={13} className="shrink-0" /></a>
        </div></div>
        <button
          onClick={copiarLink}
          className="relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-ink-900 shadow-md transition active:scale-95"
        >
          {copiado ? <><Check size={15} className="text-basil-600" /> Copiado</> : <><Clipboard size={15} /> Copiar link</>}
        </button>
      </div>

      <section className="mb-6 overflow-hidden rounded-[1.4rem] border border-ink-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[1.45rem] border border-ink-100 bg-cream-50 text-ink-400 shadow-inner">
            {logoUrl ? <img src={logoUrl} alt="Logo do estabelecimento" className="h-full w-full object-cover" /> : <ImagePlus size={25} strokeWidth={1.65} />}
          </div>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral-50 text-coral-600"><ImagePlus size={16} /></span><div><h2 className="font-display text-lg font-semibold tracking-[-.035em]">Logo do cardápio</h2><p className="text-xs text-ink-500">Aparece no topo do seu cardápio público.</p></div></div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 text-xs font-semibold text-white transition hover:bg-ink-800 active:scale-[.98]"><Upload size={15} /> {salvandoLogo ? "Atualizando..." : "Enviar arquivo"}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={salvandoLogo} onChange={(evento) => { void enviarLogo(evento.target.files?.[0]); evento.currentTarget.value = ""; }} /></label>{logoUrl && <button onClick={() => void salvarLogo("")} disabled={salvandoLogo} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ink-200 px-4 text-xs font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-50"><Trash2 size={15} /> Remover</button>}</div>
          </div>
        </div>
        <div className="border-t border-ink-100 bg-cream-50/60 p-4 sm:px-6"><label className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-600"><Link2 size={14} /> Ou cole a URL da logo</label><div className="flex flex-col gap-2 sm:flex-row"><input value={logoDigitada} onChange={(evento) => setLogoDigitada(evento.target.value)} placeholder="https://..." className="min-h-11 flex-1 rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none transition focus:border-coral-400 focus:ring-4 focus:ring-coral-500/10" /><button onClick={() => void salvarLogo(logoDigitada)} disabled={salvandoLogo || logoDigitada === logoUrl} className="min-h-11 rounded-xl border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-45">Salvar URL</button></div>{carregandoLogo ? <p className="mt-2 text-xs text-ink-400">Carregando identidade visual...</p> : erroLogo ? <p className="mt-2 text-xs text-red-600">{erroLogo}</p> : <p className="mt-2 text-xs text-ink-400">PNG, JPG ou WebP, com até 5 MB.</p>}</div>
      </section>

      <section className="mb-6 rounded-[1.4rem] border border-ink-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-basil-50 text-basil-700"><MessageCircle size={19} /></span><div><h2 className="font-display text-lg font-semibold tracking-[-.035em]">WhatsApp de atendimento</h2><p className="mt-0.5 text-xs leading-5 text-ink-500">Após registrar o pedido, o cliente é direcionado ao seu WhatsApp com todos os dados preenchidos.</p></div></div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={whatsappAtendimento} onChange={(evento) => setWhatsappAtendimento(evento.target.value)} inputMode="tel" placeholder="5511999999999" className="min-h-11 flex-1 rounded-xl border border-ink-200 bg-cream-50/50 px-3 text-sm outline-none transition focus:border-basil-500 focus:ring-4 focus:ring-basil-500/10" /><button onClick={() => void salvarWhatsapp()} disabled={salvandoWhatsapp} className="min-h-11 rounded-xl bg-ink-900 px-4 text-xs font-semibold text-white transition hover:bg-ink-800 disabled:opacity-50">{salvandoWhatsapp ? "Salvando..." : "Salvar WhatsApp"}</button></div>
        {erroWhatsapp ? <p className="mt-2 text-xs text-red-600">{erroWhatsapp}</p> : <p className="mt-2 text-xs text-ink-400">Informe com DDI e DDD. Ex.: 55 11 99999-9999.</p>}
      </section>

      <div className="of-tabs mb-5 max-w-xl">
        {ABAS.map((item) => (
          <button
            key={item.id}
            onClick={() => setAba(item.id)}
            data-active={aba === item.id}
            className="of-tab inline-flex items-center justify-center gap-2"
          >
            {item.id === "pedidos" ? <PackageOpen size={15} /> : <Globe2 size={15} />}{item.label}
          </button>
        ))}
      </div>

      {aba === "pedidos" ? (
        <KanbanBoard
          titulo="Pedidos do site"
          subtitulo="Pedidos feitos direto pelo cardápio digital"
          origem="app"
          permiteCriar={false}
        />
      ) : (
        <PrecificacaoCalculadora />
      )}
    </div>
  );
}
