"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ModuloSistema, PapelUsuario, TipoEstabelecimento } from "./tenant-types";

interface UsuarioSessao {
  id: string;
  nome: string;
  usuario: string;
  role: PapelUsuario;
}

interface EstabelecimentoSessao {
  id: string;
  nome: string;
  tipo: TipoEstabelecimento;
  tipoComida: string;
  slug: string;
  modulosAtivos: ModuloSistema[];
  onboardingConcluido: boolean;
}

interface RegistroInput {
  nome: string;
  tipo: TipoEstabelecimento;
  modulos: ModuloSistema[];
  admin: { nome: string; usuario: string; senha: string };
}

interface TenantContextValue {
  carregando: boolean;
  estabelecimento: EstabelecimentoSessao | null;
  usuarioAtual: UsuarioSessao | null;
  entrar: (usuario: string, senha: string) => Promise<string | null>;
  sair: () => Promise<void>;
  registrar: (dados: RegistroInput) => Promise<string | null>;
  concluirOnboarding: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

async function extrairErro(res: Response): Promise<string> {
  try {
    const dados = await res.json();
    return dados?.erro ?? "Ocorreu um erro inesperado.";
  } catch {
    return "Ocorreu um erro inesperado.";
  }
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [estabelecimento, setEstabelecimento] = useState<EstabelecimentoSessao | null>(null);
  const [usuarioAtual, setUsuarioAtual] = useState<UsuarioSessao | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) return;
        const dados = await res.json();
        setEstabelecimento(dados.estabelecimento);
        setUsuarioAtual(dados.usuario);
      })
      .finally(() => setCarregando(false));
  }, []);

  const entrar = useCallback(async (usuario: string, senha: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, senha }),
    });
    if (!res.ok) return extrairErro(res);
    const dados = await res.json();
    setEstabelecimento(dados.estabelecimento);
    setUsuarioAtual(dados.usuario);
    return null;
  }, []);

  const sair = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setEstabelecimento(null);
    setUsuarioAtual(null);
  }, []);

  const registrar = useCallback(async (dadosInput: RegistroInput) => {
    const res = await fetch("/api/auth/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dadosInput),
    });
    if (!res.ok) return extrairErro(res);
    const dados = await res.json();
    setEstabelecimento(dados.estabelecimento);
    setUsuarioAtual(dados.usuario);
    return null;
  }, []);

  const concluirOnboarding = useCallback(async () => {
    setEstabelecimento((atual) => (atual ? { ...atual, onboardingConcluido: true } : atual));
    await fetch("/api/estabelecimento/onboarding", { method: "PATCH" });
  }, []);

  return (
    <TenantContext.Provider value={{ carregando, estabelecimento, usuarioAtual, entrar, sair, registrar, concluirOnboarding }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant precisa estar dentro de <TenantProvider>");
  return ctx;
}
