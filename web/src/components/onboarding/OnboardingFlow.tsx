"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Calculator, MapPinned, PackagePlus, Sparkles, UsersRound } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { MODULOS } from "@/lib/tenant-types";
import { ModuleIcon } from "@/components/ui/AppIcons";
import { OhFomeMark } from "@/components/ui/OhFomeLogo";

const GRADIENTE_CORAL = "linear-gradient(120deg, var(--color-coral-600), var(--color-coral-500), var(--color-mango-500))";

type Fase = "oculto" | "intro" | "equipe" | "estoque" | "entrega";

const DURACAO_INTRO_MS = 2400;

export function OnboardingFlow() {
  const { estabelecimento, usuarioAtual, concluirOnboarding } = useTenant();
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("oculto");

  useEffect(() => {
    if (!estabelecimento || !usuarioAtual) return;
    if (usuarioAtual.role !== "admin" || estabelecimento.onboardingConcluido) return;
    const abrir = setTimeout(() => setFase("intro"), 550);
    return () => clearTimeout(abrir);
  }, [estabelecimento, usuarioAtual]);

  useEffect(() => {
    if (fase !== "intro") return;
    const avancar = setTimeout(() => setFase("equipe"), DURACAO_INTRO_MS);
    return () => clearTimeout(avancar);
  }, [fase]);

  if (fase === "oculto" || !estabelecimento) return null;

  const modulosDoTime = MODULOS.filter(
    (m) => m.id !== "estoque" && estabelecimento.modulosAtivos.includes(m.id)
  );
  const temDelivery = estabelecimento.modulosAtivos.includes("delivery");
  const totalPassos = temDelivery ? 3 : 2;

  function encerrarOnboarding() {
    void concluirOnboarding();
    setFase("oculto");
  }

  function irParaEquipe() {
    router.push("/equipe");
    setFase("estoque");
  }

  function irParaEstoque() {
    router.push("/estoque");
    if (temDelivery) setFase("entrega");
    else encerrarOnboarding();
  }

  function irParaEntrega() {
    router.push("/delivery");
    encerrarOnboarding();
  }

  function adiar() {
    if (fase === "equipe") setFase("estoque");
    else if (fase === "estoque" && temDelivery) setFase("entrega");
    else encerrarOnboarding();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/55 p-4 backdrop-blur-sm"
      style={{ animation: "of-fade .25s ease both" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && fase !== "intro") adiar();
      }}
    >
      {fase === "intro" && (
        <div className="flex w-full max-w-sm flex-col items-center rounded-[2rem] bg-surface px-8 py-12 text-center shadow-2xl" style={{ animation: "onb-pop .45s cubic-bezier(.2,.8,.2,1) both" }}>
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl text-cream-50 shadow-xl" style={{ background: GRADIENTE_CORAL, animation: "onb-ring 2.1s ease-in-out infinite" }}>
            <OhFomeMark className="h-11 w-11" />
          </div>
          <p className="mt-6 font-display text-xl font-bold text-ink-900">Bem-vindo(a), {estabelecimento.nome}!</p>
          <p className="mt-2 text-sm leading-6 text-ink-400">Sua conta foi criada com sucesso. Vamos deixar tudo pronto pra operação começar.</p>
          <div className="mt-6 flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-coral-400" style={{ animation: `onb-dot 1.1s ease-in-out ${i * 0.16}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {fase === "equipe" && (
        <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-surface shadow-2xl" style={{ animation: "onb-pop .4s cubic-bezier(.2,.8,.2,1) both" }}>
          <div className="relative overflow-hidden px-7 pt-7 pb-6" style={{ background: GRADIENTE_CORAL }}>
            <span className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
            <span className="pointer-events-none absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/10" />
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/75">Primeiros passos · 1 de {totalPassos}</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25"><UsersRound size={20} /></span>
              <p className="font-display text-xl font-bold leading-tight text-white">Chame o time pra mesa</p>
            </div>
          </div>

          <div className="px-7 py-6">
            <p className="text-sm leading-6 text-ink-600">
              Crie um acesso próprio para cada função do seu plano. Assim cada pessoa vê só a tela dela, com um passo a passo de demonstração na primeira vez que entrar.
            </p>

            <div className="mt-5 space-y-2">
              {modulosDoTime.map((modulo, i) => (
                <div
                  key={modulo.id}
                  className="flex items-center gap-3 rounded-xl bg-cream-50 px-3.5 py-2.5"
                  style={{ animation: `onb-item .35s ease both`, animationDelay: `${i * 70}ms` }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-coral-600 shadow-sm ring-1 ring-cream-200"><ModuleIcon modulo={modulo.id} size={15} strokeWidth={1.8} /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink-900">{modulo.label}</p>
                    <p className="truncate text-[11px] text-ink-400">{modulo.descricao}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={irParaEquipe}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:shadow-xl"
                style={{ background: GRADIENTE_CORAL }}
              >
                Criar acessos da equipe <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={adiar}
                className="min-h-11 w-full rounded-xl text-sm font-semibold text-ink-400 transition hover:text-ink-600"
              >
                Fazer isso depois
              </button>
            </div>
          </div>
        </div>
      )}

      {fase === "estoque" && (
        <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-surface shadow-2xl" style={{ animation: "onb-pop .4s cubic-bezier(.2,.8,.2,1) both" }}>
          <div className="relative overflow-hidden px-7 pt-7 pb-6 bg-ink-900">
            <span className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-mango-400/15" />
            <span className="pointer-events-none absolute -bottom-14 -left-8 h-32 w-32 rounded-full bg-coral-500/15" />
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/55">Primeiros passos · 2 de {totalPassos}</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-mango-400 ring-1 ring-white/15"><PackagePlus size={20} /></span>
              <p className="font-display text-xl font-bold leading-tight text-white">Monte seu estoque e preços</p>
            </div>
          </div>

          <div className="px-7 py-6">
            <p className="text-sm leading-6 text-ink-600">
              Cadastre os insumos que você usa e deixe a calculadora de precificação sugerir quanto cobrar em cada prato, com a margem que você quiser.
            </p>

            <div className="mt-5 flex items-center gap-3 rounded-xl bg-cream-50 px-3.5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-mango-500 shadow-sm ring-1 ring-cream-200"><Calculator size={16} /></span>
              <p className="text-xs leading-5 text-ink-600"><b className="text-ink-900">Preço sugerido automático</b> a partir do custo de cada insumo do prato.</p>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={irParaEstoque}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink-900 text-sm font-bold text-white shadow-lg shadow-ink-900/20 transition hover:shadow-xl"
              >
                <Sparkles size={16} /> Configurar estoque e preços
              </button>
              <button
                type="button"
                onClick={adiar}
                className="min-h-11 w-full rounded-xl text-sm font-semibold text-ink-400 transition hover:text-ink-600"
              >
                Fazer isso depois
              </button>
            </div>
          </div>
        </div>
      )}

      {fase === "entrega" && (
        <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-surface shadow-2xl" style={{ animation: "onb-pop .4s cubic-bezier(.2,.8,.2,1) both" }}>
          <div className="relative overflow-hidden px-7 pt-7 pb-6" style={{ background: GRADIENTE_CORAL }}>
            <span className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
            <span className="pointer-events-none absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/10" />
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/75">Primeiros passos · 3 de {totalPassos}</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25"><MapPinned size={20} /></span>
              <p className="font-display text-xl font-bold leading-tight text-white">Defina as taxas de entrega</p>
            </div>
          </div>

          <div className="px-7 py-6">
            <p className="text-sm leading-6 text-ink-600">
              Já deixamos os bairros de Morada Nova prontos pra você. Ative os que você atende e diga quanto cobrar em cada um — o cardápio digital calcula a taxa sozinho quando o cliente escolhe o bairro na hora de pedir.
            </p>

            <div className="mt-5 flex items-center gap-3 rounded-xl bg-cream-50 px-3.5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-coral-600 shadow-sm ring-1 ring-cream-200"><MapPinned size={16} /></span>
              <p className="text-xs leading-5 text-ink-600"><b className="text-ink-900">15 bairros já cadastrados</b>, só falta você ativar e definir o valor.</p>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={irParaEntrega}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:shadow-xl"
                style={{ background: GRADIENTE_CORAL }}
              >
                Configurar taxas de entrega <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={adiar}
                className="min-h-11 w-full rounded-xl text-sm font-semibold text-ink-400 transition hover:text-ink-600"
              >
                Fazer isso depois
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
