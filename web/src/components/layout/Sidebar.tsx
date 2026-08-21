"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, LogOut, Settings2, Sparkles, UsersRound } from "lucide-react";
import { modulosPermitidos, SEGMENTOS } from "@/lib/tenant-types";
import { useTenant } from "@/lib/tenant-context";
import Image from "next/image";
import { ModuleIcon, SegmentIcon } from "@/components/ui/AppIcons";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { estabelecimento, usuarioAtual, sair } = useTenant();
  const modulos = estabelecimento && usuarioAtual ? modulosPermitidos(usuarioAtual.role, estabelecimento.modulosAtivos) : [];
  const segmento = SEGMENTOS.find((item) => item.id === estabelecimento?.tipo);

  async function logout() {
    await sair();
    router.push("/login");
  }

  return (
    <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 flex-col border-r border-cream-200/80 bg-surface/92 px-4 py-5 backdrop-blur-xl md:flex">
      <Link href={modulos[0]?.href ?? "/"} className="flex min-h-11 items-center gap-3 px-2">
        <Image src="/marca/ohfome-icone.svg" alt="OhFome" width={1254} height={1254} className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_12px_18px_rgba(232,93,63,.16)]" priority />
        <span>
          <strong className="block font-display text-lg font-bold tracking-[-.04em] text-ink-900">OhFome</strong>
          <small className="block text-[10px] font-medium uppercase tracking-[.15em] text-ink-400">Operação inteligente</small>
        </span>
      </Link>

      <div className="mt-7 rounded-2xl border border-cream-200 bg-cream-50/80 p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-coral-600 shadow-sm ring-1 ring-cream-200">
            {estabelecimento && <SegmentIcon segmento={estabelecimento.tipo} size={19} strokeWidth={1.8} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink-900">{estabelecimento?.nome ?? "Estabelecimento"}</p>
            <p className="truncate text-[11px] text-ink-400">{segmento?.label}</p>
          </div>
          <ChevronRight size={15} className="text-ink-400" />
        </div>
      </div>

      <p className="mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-ink-400">Espaço de trabalho</p>
      <nav className="flex flex-1 flex-col gap-1">
        {modulos.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-all duration-200 ${active ? "bg-ink-900 text-white shadow-lg shadow-ink-900/15" : "text-ink-600 hover:bg-cream-100 hover:text-ink-900"}`}>
              <ModuleIcon modulo={item.id} size={18} strokeWidth={1.8} className={active ? "text-coral-400" : "text-ink-400 transition-colors group-hover:text-coral-500"} />
              <span className="flex-1">{item.label}</span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-coral-400" />}
            </Link>
          );
        })}
        {usuarioAtual?.role === "admin" && <Link href="/equipe" aria-current={pathname?.startsWith("/equipe") ? "page" : undefined} className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-all duration-200 ${pathname?.startsWith("/equipe") ? "bg-ink-900 text-white shadow-lg shadow-ink-900/15" : "text-ink-600 hover:bg-cream-100 hover:text-ink-900"}`}><UsersRound size={18} strokeWidth={1.8} className={pathname?.startsWith("/equipe") ? "text-coral-400" : "text-ink-400 transition-colors group-hover:text-coral-500"} /><span className="flex-1">Equipe</span>{pathname?.startsWith("/equipe") && <span className="h-1.5 w-1.5 rounded-full bg-coral-400" />}</Link>}
        {usuarioAtual?.role === "admin" && <Link href="/configuracoes" aria-current={pathname?.startsWith("/configuracoes") ? "page" : undefined} className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-all duration-200 ${pathname?.startsWith("/configuracoes") ? "bg-ink-900 text-white shadow-lg shadow-ink-900/15" : "text-ink-600 hover:bg-cream-100 hover:text-ink-900"}`}><Settings2 size={18} strokeWidth={1.8} className={pathname?.startsWith("/configuracoes") ? "text-coral-400" : "text-ink-400 transition-colors group-hover:text-coral-500"} /><span className="flex-1">Configurações</span>{pathname?.startsWith("/configuracoes") && <span className="h-1.5 w-1.5 rounded-full bg-coral-400" />}</Link>}
      </nav>

      <div className="mb-3 rounded-2xl border border-coral-100 bg-coral-050/70 p-3.5">
        <div className="flex items-center gap-2 text-coral-600"><Sparkles size={14} /><span className="text-[10px] font-bold uppercase tracking-[.12em]">Ambiente protegido</span></div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-600">Dados isolados e sincronizados para sua equipe.</p>
      </div>

      <div className="flex items-center gap-2 border-t border-cream-200 pt-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-900 font-display text-xs font-bold text-white">{usuarioAtual?.nome?.slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-ink-900">{usuarioAtual?.nome}</p><p className="truncate text-[10px] text-ink-400">@{usuarioAtual?.usuario}</p></div>
        <button onClick={logout} className="of-icon-btn !h-10 !min-h-10 !w-10" aria-label="Sair da conta" title="Sair"><LogOut size={16} /></button>
      </div>
    </aside>
  );
}
