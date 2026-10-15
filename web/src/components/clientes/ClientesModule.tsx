"use client";

import { memo, useMemo, useState } from "react";
import { Pencil, Plus, Search, UsersRound } from "lucide-react";
import type { Cliente } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { ClienteFormModal } from "./ClienteFormModal";

const ClienteRow = memo(function ClienteRow({ cliente, onEditar }: { cliente: Cliente; onEditar: (cliente: Cliente) => void }) {
  return (
    <li className="flex items-center gap-3 p-4 sm:p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-050 font-display text-xs font-bold text-coral-700">{cliente.nome.slice(0, 2).toUpperCase()}</div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{cliente.nome}</p><p className="mt-0.5 truncate text-xs text-ink-500">{cliente.telefone || "Sem telefone"}{cliente.endereco ? ` · ${cliente.endereco}` : ""}{cliente.bairro ? ` · ${cliente.bairro}` : ""}</p></div>
      <button onClick={() => onEditar(cliente)} className="of-icon-btn" aria-label={`Editar ${cliente.nome}`} title="Editar cliente"><Pencil size={15} /></button>
    </li>
  );
}, (anterior, atual) => JSON.stringify(anterior.cliente) === JSON.stringify(atual.cliente));

export function ClientesModule() {
  const { dados, setDados, recarregar } = usePolling<Cliente[]>("/api/clientes", 30000);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Cliente | null | undefined>(undefined);
  const clientes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return dados ?? [];
    return (dados ?? []).filter((cliente) => `${cliente.nome} ${cliente.telefone ?? ""}`.toLowerCase().includes(termo));
  }, [dados, busca]);

  return <section className="of-page">
    <header className="of-page-header"><div><p className="of-eyebrow">Relacionamento</p><h1 className="of-title">Clientes</h1><p className="of-subtitle">Cadastre e encontre rapidamente quem já pediu no seu estabelecimento.</p></div><button onClick={() => setEditando(null)} className="of-btn-primary"><Plus size={17} />Novo cliente</button></header>
    <section className="of-panel overflow-hidden">
      <div className="border-b border-cream-200 p-4"><div className="relative max-w-lg"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar por nome ou telefone" className="of-field !pl-10" /></div></div>
      {!clientes.length ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-coral-600"><UsersRound size={22} /></span><p className="mt-4 text-sm font-semibold text-ink-900">{busca ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}</p><p className="mt-1 max-w-sm text-xs leading-5 text-ink-400">{busca ? "Confira o nome ou telefone informado." : "Cadastre clientes para acelerar os próximos pedidos delivery."}</p></div> : <ul className="divide-y divide-cream-100">{clientes.map((cliente) => <ClienteRow key={cliente.id} cliente={cliente} onEditar={setEditando} />)}</ul>}
    </section>
    {editando !== undefined && <ClienteFormModal key={editando?.id ?? "novo"} cliente={editando} onFechar={() => setEditando(undefined)} onSalvo={(cliente) => { setDados((lista) => { const existe = (lista ?? []).some((item) => item.id === cliente.id); return existe ? (lista ?? []).map((item) => item.id === cliente.id ? cliente : item) : [cliente, ...(lista ?? [])]; }); setEditando(undefined); recarregar(); }} />}
  </section>;
}
