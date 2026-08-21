"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTenant } from "@/lib/tenant-context";
import { DIAS_TESTE_GRATIS, MODULOS, MODULOS_DE_VENDA, SEGMENTOS, planoParaModulos } from "@/lib/tenant-types";
import type { ModuloSistema, TipoEstabelecimento } from "@/lib/tenant-types";
import { Check } from "lucide-react";
import { ModuleIcon, SegmentIcon } from "@/components/ui/AppIcons";

interface CampoUsuario {
  nome: string;
  usuario: string;
  senha: string;
}

const CAMPO_VAZIO: CampoUsuario = { nome: "", usuario: "", senha: "" };

const PASSOS = ["Estabelecimento", "Módulos", "Administrador", "Revisão"];

const GRADIENTE_CORAL = "linear-gradient(120deg, var(--color-coral-600), var(--color-coral-500), var(--color-mango-500))";

const CAMPO_CLASSE =
  "w-full rounded-xl border border-transparent bg-cream-50 px-3.5 py-3 text-sm text-ink-900 outline-none transition focus:border-coral-400 focus:ring-4 focus:ring-coral-100";
const CAMPO_CLASSE_SM =
  "rounded-lg border border-transparent bg-cream-50 px-2.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-coral-400 focus:ring-4 focus:ring-coral-100";

export default function RegistroPage() {
  const { registrar } = useTenant();
  const router = useRouter();

  const [passo, setPasso] = useState(0);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoEstabelecimento | null>(null);
  const [modulos, setModulos] = useState<ModuloSistema[]>([]);
  const [admin, setAdmin] = useState<CampoUsuario>(CAMPO_VAZIO);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  function alternarModulo(id: ModuloSistema) {
    setModulos((atual) => {
      const temBalcao = atual.includes("balcao");

      if (id === "balcao") return temBalcao ? [] : ["balcao"];
      if (!temBalcao) return atual;
      if (id === "cozinha" && !atual.includes("garcom")) return atual;
      if (id === "garcom" && atual.includes("garcom")) return atual.filter((modulo) => modulo !== "garcom" && modulo !== "cozinha");
      return atual.includes(id) ? atual.filter((modulo) => modulo !== id) : [...atual, id];
    });
  }

  const planoSelecionado = planoParaModulos(modulos);
  const modulosAtivos = modulos.includes("site") ? [...modulos, "delivery" as ModuloSistema] : modulos;
  const passo1Valido = nome.trim().length > 1 && tipo !== null;
  const passo2Valido = Boolean(planoSelecionado);
  const passo3Valido = admin.nome && admin.usuario && admin.senha;

  async function finalizar() {
    if (!tipo) return;
    setErro("");
    setEnviando(true);
    const erroApi = await registrar({ nome, tipo, modulos, admin });
    setEnviando(false);
    if (erroApi) {
      setErro(erroApi);
      return;
    }
    const primeiroModulo = MODULOS.find((m) => modulos.includes(m.id));
    router.replace(primeiroModulo?.href ?? "/");
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink-900">Cadastre seu estabelecimento</h1>
      <p className="mt-1 mb-6 text-sm text-ink-400">Leva menos de 2 minutos.</p>

      <ol className="mb-8 flex items-center gap-2">
        {PASSOS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all ${
                i <= passo ? "text-white shadow-md shadow-coral-500/25" : "bg-cream-200 text-ink-400"
              }`}
              style={i <= passo ? { background: GRADIENTE_CORAL } : undefined}
            >
              {i + 1}
            </span>
            {i < PASSOS.length - 1 && (
              <span
                className="h-[3px] flex-1 rounded-full transition-all"
                style={{ background: i < passo ? GRADIENTE_CORAL : "var(--color-cream-200)" }}
              />
            )}
          </li>
        ))}
      </ol>

      {passo === 0 && (
        <div className="space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-600">Nome do estabelecimento</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Milleto Churrascaria"
              className={CAMPO_CLASSE}
            />
          </label>

          <div>
            <span className="mb-2 block text-xs font-semibold text-ink-600">Tipo de estabelecimento</span>
            <div className="grid grid-cols-2 gap-2.5">
              {SEGMENTOS.map((segmento) => (
                <button
                  key={segmento.id}
                  type="button"
                  onClick={() => setTipo(segmento.id)}
                  className={`rounded-2xl p-3.5 text-left transition-all ${
                    tipo === segmento.id
                      ? "bg-coral-050 shadow-md shadow-coral-500/15 ring-2 ring-coral-400"
                      : "bg-cream-50 hover:bg-cream-100"
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-coral-600 shadow-sm ring-1 ring-cream-200"><SegmentIcon segmento={segmento.id} size={18} strokeWidth={1.8} /></span>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{segmento.label}</p>
                  <p className="text-[11px] text-ink-400">{segmento.exemploCardapio}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!passo1Valido}
            onClick={() => setPasso(1)}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: GRADIENTE_CORAL }}
          >
            Continuar
          </button>
        </div>
      )}

      {passo === 1 && (
        <div className="space-y-5">
          <div>
            <span className="mb-1 block text-xs font-semibold text-ink-600">Monte a operação do seu cliente</span>
            <p className="mb-3 text-[11px] leading-5 text-ink-400">Administração está incluída em todos os planos. Central de pedidos é a base da operação.</p>
            <div className="space-y-2">
              {MODULOS_DE_VENDA.map((id) => {
                const modulo = MODULOS.find((item) => item.id === id)!;
                const indisponivel = (id !== "balcao" && !modulos.includes("balcao")) || (id === "cozinha" && !modulos.includes("garcom"));
                return (
                <button
                  key={modulo.id}
                  type="button"
                  onClick={() => alternarModulo(modulo.id)}
                  disabled={indisponivel}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-all ${
                    modulos.includes(modulo.id)
                      ? "bg-coral-050 shadow-md shadow-coral-500/15 ring-2 ring-coral-400"
                      : indisponivel ? "cursor-not-allowed bg-cream-100/70 opacity-55" : "bg-cream-50 hover:bg-cream-100"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-coral-600 shadow-sm ring-1 ring-cream-200"><ModuleIcon modulo={modulo.id} size={18} strokeWidth={1.8} /></span>
                  <span className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{modulo.label}</p>
                    <p className="text-[11px] text-ink-400">{modulo.descricao}</p>
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] text-white transition-all ${
                      modulos.includes(modulo.id) ? "shadow-sm" : "bg-cream-300 text-transparent"
                    }`}
                    style={modulos.includes(modulo.id) ? { background: GRADIENTE_CORAL } : undefined}
                  >
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                </button>
                );
              })}
            </div>
          </div>

          <div className={`rounded-2xl p-4 ring-1 transition-all ${planoSelecionado ? "bg-coral-050 ring-coral-100" : "bg-cream-50 ring-cream-200"}`}>
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-ink-400">Plano identificado</p>
            {planoSelecionado ? (
              <>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="font-display text-xl font-bold text-coral-600">{planoSelecionado.label}</p>
                  <p className="text-sm font-semibold text-ink-600">
                    R$ {planoSelecionado.precoMensal}
                    <span className="text-xs font-normal text-ink-400">/mês</span>
                  </p>
                </div>
                <p className="mt-1 text-xs leading-5 text-ink-600">{planoSelecionado.descricao}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink-600 ring-1 ring-cream-200">
                    <Check size={13} className="text-coral-600" /> Administração incluída
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink-600 ring-1 ring-cream-200">
                    <Check size={13} className="text-coral-600" /> {DIAS_TESTE_GRATIS} dias grátis para testar
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs leading-5 text-ink-400">Selecione Central de pedidos para visualizar o plano correspondente.</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPasso(0)}
              className="flex-1 rounded-xl bg-cream-100 py-3 text-sm font-semibold text-ink-600 transition hover:bg-cream-200"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={!passo2Valido}
              onClick={() => setPasso(2)}
              className="flex-1 rounded-xl py-3 text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: GRADIENTE_CORAL }}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-coral-050 p-3.5 ring-1 ring-coral-100">
            <p className="text-xs font-semibold text-coral-600">Administrador (acesso total)</p>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={admin.nome}
                onChange={(e) => setAdmin({ ...admin, nome: e.target.value })}
                placeholder="Nome"
                className={CAMPO_CLASSE_SM}
              />
              <input
                value={admin.usuario}
                onChange={(e) => setAdmin({ ...admin, usuario: e.target.value.toLowerCase() })}
                placeholder="Usuário"
                autoComplete="username"
                className={CAMPO_CLASSE_SM}
              />
              <input
                type="password"
                value={admin.senha}
                onChange={(e) => setAdmin({ ...admin, senha: e.target.value })}
                placeholder="Senha"
                className={CAMPO_CLASSE_SM}
              />
            </div>
          </div>

          <p className="rounded-2xl bg-cream-50 px-3.5 py-3 text-xs leading-5 text-ink-500">Você poderá criar os demais acessos e escolher os cargos depois, na área Equipe.</p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPasso(1)}
              className="flex-1 rounded-xl bg-cream-100 py-3 text-sm font-semibold text-ink-600 transition hover:bg-cream-200"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={!passo3Valido}
              onClick={() => setPasso(3)}
              className="flex-1 rounded-xl py-3 text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: GRADIENTE_CORAL }}
            >
              Revisar
            </button>
          </div>
        </div>
      )}

      {passo === 3 && tipo && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-cream-50 p-4">
            <p className="font-display text-lg font-bold text-ink-900">{nome}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-400">
              <SegmentIcon segmento={tipo} size={15} /> {SEGMENTOS.find((s) => s.id === tipo)?.label}
            </p>

            {planoSelecionado && (
              <div className="mt-4 rounded-xl bg-coral-050 px-3 py-2.5 ring-1 ring-coral-100">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-coral-600">Plano contratado</p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                  <p className="font-display text-base font-bold text-ink-900">{planoSelecionado.label}</p>
                  <p className="text-sm font-semibold text-ink-600">
                    R$ {planoSelecionado.precoMensal}
                    <span className="text-xs font-normal text-ink-400">/mês</span>
                  </p>
                </div>
                <p className="mt-1 text-[11px] font-semibold text-coral-600">
                  {DIAS_TESTE_GRATIS} dias grátis antes da primeira cobrança
                </p>
              </div>
            )}

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-400">Módulos ativos</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-050 px-2.5 py-1 text-xs font-semibold text-coral-600 ring-1 ring-coral-100"><Check size={13} /> Administração</span>
              {modulosAtivos.map((m) => (
                <span key={m} className="inline-flex items-center gap-1.5 rounded-full bg-coral-050 px-2.5 py-1 text-xs font-semibold text-coral-600 ring-1 ring-coral-100">
                  <ModuleIcon modulo={m} size={13} /> {MODULOS.find((mod) => mod.id === m)?.label}
                </span>
              ))}
            </div>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-400">Acessos criados</p>
            <ul className="mt-1.5 space-y-1 text-sm text-ink-900">
              <li>
                {admin.nome} <span className="text-xs text-ink-400">· {admin.usuario} · admin</span>
              </li>
            </ul>
          </div>

          {erro && <p className="text-xs font-medium text-danger-600">{erro}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPasso(2)}
              className="flex-1 rounded-xl bg-cream-100 py-3 text-sm font-semibold text-ink-600 transition hover:bg-cream-200"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={finalizar}
              disabled={enviando}
              className="flex-1 rounded-xl py-3 text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: GRADIENTE_CORAL }}
            >
              {enviando ? "Criando..." : "Criar estabelecimento"}
            </button>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-ink-400">
        Já tem cadastro?{" "}
        <Link href="/login" className="font-semibold text-coral-600 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
