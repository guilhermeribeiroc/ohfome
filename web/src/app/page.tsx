"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/lib/tenant-context";
import { modulosPermitidos } from "@/lib/tenant-types";

export default function RootPage() {
  const { carregando, estabelecimento, usuarioAtual } = useTenant();
  const router = useRouter();

  useEffect(() => {
    if (carregando) return;
    if (!estabelecimento || !usuarioAtual) {
      router.replace("/login");
      return;
    }
    const permitidos = modulosPermitidos(usuarioAtual.role, estabelecimento.modulosAtivos);
    router.replace(permitidos[0]?.href ?? "/login");
  }, [carregando, estabelecimento, usuarioAtual, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 text-sm text-ink-400">
      Carregando...
    </div>
  );
}
