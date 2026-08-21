"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { modulosPermitidos } from "@/lib/tenant-types";
import { useTenant } from "@/lib/tenant-context";
import { ModuleIcon } from "@/components/ui/AppIcons";
import { Settings2, UsersRound } from "lucide-react";

export function MobileNav() {
  const pathname = usePathname();
  const { estabelecimento, usuarioAtual } = useTenant();
  const modulos = estabelecimento && usuarioAtual ? modulosPermitidos(usuarioAtual.role, estabelecimento.modulosAtivos) : [];

  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-3 bottom-3 z-40 flex min-h-[66px] items-center gap-1 overflow-x-auto rounded-[1.35rem] border border-white/70 bg-ink-900/95 p-1.5 shadow-[0_22px_50px_-18px_rgba(25,23,20,.65)] backdrop-blur-xl md:hidden">
      {modulos.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`relative flex min-h-[52px] min-w-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-[1rem] px-2 text-[9px] font-medium transition-all duration-200 ${active ? "bg-white text-ink-900 shadow-sm" : "text-white/55 active:bg-white/10"}`}>
            <ModuleIcon modulo={item.id} size={19} strokeWidth={active ? 2 : 1.7} className={active ? "text-coral-500" : ""} />
            <span className="max-w-[72px] truncate">{item.label.replace(" & Preços", "")}</span>
          </Link>
        );
      })}
      {usuarioAtual?.role === "admin" && <Link href="/equipe" aria-current={pathname?.startsWith("/equipe") ? "page" : undefined} className={`relative flex min-h-[52px] min-w-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-[1rem] px-2 text-[9px] font-medium transition-all duration-200 ${pathname?.startsWith("/equipe") ? "bg-white text-ink-900 shadow-sm" : "text-white/55 active:bg-white/10"}`}><UsersRound size={19} strokeWidth={pathname?.startsWith("/equipe") ? 2 : 1.7} className={pathname?.startsWith("/equipe") ? "text-coral-500" : ""} /><span>Equipe</span></Link>}
      {usuarioAtual?.role === "admin" && <Link href="/configuracoes" aria-current={pathname?.startsWith("/configuracoes") ? "page" : undefined} className={`relative flex min-h-[52px] min-w-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-[1rem] px-2 text-[9px] font-medium transition-all duration-200 ${pathname?.startsWith("/configuracoes") ? "bg-white text-ink-900 shadow-sm" : "text-white/55 active:bg-white/10"}`}><Settings2 size={19} strokeWidth={pathname?.startsWith("/configuracoes") ? 2 : 1.7} className={pathname?.startsWith("/configuracoes") ? "text-coral-500" : ""} /><span>Ajustes</span></Link>}
    </nav>
  );
}
