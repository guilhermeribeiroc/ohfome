"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, TriangleAlert } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";

export default function LoginPage() {
  const { entrar } = useTenant();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setErro(""); setEnviando(true);
    const erroApi = await entrar(email, senha);
    setEnviando(false);
    if (erroApi) { setErro(erroApi); return; }
    router.replace("/");
  }

  return (
    <div className="mx-auto max-w-sm">
      <p className="of-eyebrow">Acesso da equipe</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-[-.05em] text-ink-900">Bem-vindo</h1>
      <p className="mb-8 mt-2 text-sm leading-6 text-ink-400">Entre para acompanhar a operação do seu estabelecimento.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block"><span className="of-label">E-mail</span><div className="relative"><Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input type="email" required autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErro(""); }} placeholder="voce@estabelecimento.com" className="of-field !pl-10" /></div></label>
        <label className="block"><span className="of-label">Senha</span><div className="relative"><LockKeyhole size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input type={mostrarSenha ? "text" : "password"} required autoComplete="current-password" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(""); }} placeholder="Sua senha" className="of-field !px-10" /><button type="button" onClick={() => setMostrarSenha((valor) => !valor)} aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 transition hover:bg-cream-100 hover:text-ink-900">{mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>

        {erro && <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-050 p-3 text-xs font-medium leading-5 text-danger-600 ring-1 ring-danger-400/15"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{erro}</p>}

        <button type="submit" disabled={enviando} className="of-btn-primary mt-2 w-full">{enviando ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Entrando...</> : <>Entrar no sistema <ArrowRight size={16} /></>}</button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[.14em] text-ink-400"><i className="h-px flex-1 bg-cream-200" />Primeiro acesso<i className="h-px flex-1 bg-cream-200" /></div>
      <Link href="/registro" className="of-btn-secondary w-full">Cadastrar estabelecimento <ArrowRight size={15} /></Link>
    </div>
  );
}
