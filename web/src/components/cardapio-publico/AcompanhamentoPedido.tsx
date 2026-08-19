"use client";

import { Bell, Check, ChefHat, MessageCircle, PackageCheck, PackageSearch, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { OhFomeMark } from "@/components/ui/OhFomeLogo";

type Status = "novo" | "em_preparo" | "pronto" | "saiu_para_entrega" | "finalizado" | "cancelado";

interface PedidoPublicoStatus {
  id: string;
  codigo: number;
  status: Status;
  formaRecebimento: "entrega" | "retirada" | null;
  createdAt: string;
  notificadoEm: string | null;
  notificadoMensagem: string | null;
  estabelecimentoNome: string;
  itens: { produtoNome: string; quantidade: number }[];
}

const ETAPAS: { status: Status; label: string; icon: LucideIcon }[] = [
  { status: "novo", label: "Pedido recebido", icon: Bell },
  { status: "em_preparo", label: "Em preparo", icon: ChefHat },
  { status: "pronto", label: "Pronto", icon: PackageCheck },
  { status: "saiu_para_entrega", label: "Saiu para entrega", icon: Truck },
  { status: "finalizado", label: "Entregue", icon: Check },
];

export function AcompanhamentoPedido({ slug, pedidoId }: { slug: string; pedidoId: string }) {
  const { dados, carregando, erro } = usePolling<PedidoPublicoStatus>(`/api/publico/${slug}/pedidos/${pedidoId}`, 5000);

  if (carregando && !dados) {
    return (
      <div className="cardapio-theme flex min-h-dvh items-center justify-center bg-[#eee8df]">
        <div className="flex flex-col items-center gap-3 text-black/40">
          <i className="of-skeleton block h-12 w-12 rounded-full" />
          <p className="text-xs font-medium">Carregando pedido...</p>
        </div>
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="cardapio-theme flex min-h-dvh items-center justify-center bg-[#eee8df] px-6 text-center">
        <div>
          <p className="font-display text-xl font-semibold">Pedido não encontrado</p>
          <p className="mt-2 text-sm text-black/45">Confira o link ou volte ao cardápio.</p>
        </div>
      </div>
    );
  }

  const etapasVisiveis = dados.formaRecebimento === "retirada" ? ETAPAS.filter((e) => e.status !== "saiu_para_entrega") : ETAPAS;
  const indiceAtual = etapasVisiveis.findIndex((e) => e.status === dados.status);
  const cancelado = dados.status === "cancelado";

  return (
    <div className="cardapio-theme min-h-dvh bg-[#eee8df] px-5 py-8 sm:py-14">
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#181714] text-white"><OhFomeMark className="h-6 w-6" /></span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/40">{dados.estabelecimentoNome}</p>
            <p className="text-sm font-semibold text-black/70">Pedido #{dados.codigo}</p>
          </div>
        </div>

        {dados.notificadoMensagem && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-[#0e7775] p-4 text-white shadow-lg shadow-[#0e7775]/20">
            <MessageCircle size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm leading-6">{dados.notificadoMensagem}</p>
          </div>
        )}

        {cancelado ? (
          <div className="mt-8 rounded-3xl bg-white/60 p-6 text-center">
            <p className="font-display text-xl font-semibold text-black/70">Pedido cancelado</p>
            <p className="mt-2 text-sm text-black/45">Fale com o estabelecimento se isso não era esperado.</p>
          </div>
        ) : (
          <ol className="mt-9 space-y-0">
            {etapasVisiveis.map((etapa, i) => {
              const alcancado = i <= indiceAtual;
              const atual = i === indiceAtual;
              const Icon = etapa.icon;
              return (
                <li key={etapa.status} className="relative flex gap-4 pb-9 last:pb-0">
                  {i < etapasVisiveis.length - 1 && (
                    <span className={`absolute left-[19px] top-10 h-full w-[3px] rounded-full transition-colors duration-500 ${i < indiceAtual ? "bg-[#0e7775]" : "bg-black/[.08]"}`} />
                  )}
                  <span
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-500 ${
                      alcancado ? "bg-[#0e7775] text-white shadow-lg shadow-[#0e7775]/25" : "bg-white text-black/25"
                    } ${atual ? "ring-4 ring-[#0e7775]/20" : ""}`}
                  >
                    <Icon size={17} />
                  </span>
                  <div className="pt-2">
                    <p className={`text-sm font-semibold transition-colors ${alcancado ? "text-black/85" : "text-black/35"}`}>{etapa.label}</p>
                    {atual && <p className="mt-0.5 text-xs font-medium text-[#0e7775]">Agora</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-8 rounded-2xl border border-black/[.08] bg-white/50 p-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-black/40"><PackageSearch size={12} /> Itens do pedido</p>
          <ul className="space-y-1.5">
            {dados.itens.map((item, i) => (
              <li key={i} className="flex justify-between gap-3 text-sm text-black/70">
                <span><b className="mr-1.5 text-black">{item.quantidade}×</b>{item.produtoNome}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-center text-[11px] leading-5 text-black/35">Esta página atualiza sozinha. Pode deixar essa aba aberta.</p>
      </div>
    </div>
  );
}
