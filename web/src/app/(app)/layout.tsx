"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { useTenant } from "@/lib/tenant-context";
import { modulosPermitidos } from "@/lib/tenant-types";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { ImpressaoQzTray } from "@/components/cozinha/ImpressaoQzTray";
import { PwaRegistro } from "@/components/pwa/PwaRegistro";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const { carregando, estabelecimento, usuarioAtual } = useTenant();
  const router = useRouter();
  const pathname = usePathname();

  const permitidos = useMemo(
    () => estabelecimento && usuarioAtual ? modulosPermitidos(usuarioAtual.role, estabelecimento.modulosAtivos) : [],
    [estabelecimento, usuarioAtual]
  );
  const moduloPermitido = permitidos.find((m) => pathname?.startsWith(m.href));
  const equipePermitida = usuarioAtual?.role === "admin" && pathname?.startsWith("/equipe");
  const configuracaoPermitida = usuarioAtual?.role === "admin" && pathname?.startsWith("/configuracoes");
  const rotaBloqueada = Boolean(estabelecimento) && !moduloPermitido && !equipePermitida && !configuracaoPermitida;

  useEffect(() => {
    if (!carregando && !estabelecimento) {
      router.replace("/login");
      return;
    }
    if (!carregando && rotaBloqueada) {
      router.replace(permitidos[0]?.href ?? "/login");
    }
  }, [carregando, estabelecimento, rotaBloqueada, permitidos, router]);

  if (carregando || !estabelecimento || rotaBloqueada) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream-50">
        <div className="flex flex-col items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2 shadow-xl ring-1 ring-cream-200"><Image src="/marca/ohfome-icone.svg" alt="OhFome" width={1254} height={1254} className="h-full w-full object-contain" priority /></span>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-cream-200"><i className="block h-full w-1/2 animate-pulse rounded-full bg-coral-500" /></div>
          <span className="text-[11px] font-medium text-ink-400">Preparando seu espaço</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-cream-50">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      <MobileNav />
      <OnboardingFlow />
      <ImpressaoQzTray compacta />
      <PwaRegistro />
    </div>
  );
}
