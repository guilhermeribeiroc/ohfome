"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { BairroEntrega, Cliente } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

export type ClienteRascunho = {
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  pontoReferencia: string;
  email: string;
  notificarPedido: boolean;
};

const VAZIO: ClienteRascunho = { nome: "", telefone: "", endereco: "", bairro: "", pontoReferencia: "", email: "", notificarPedido: false };

export function ClienteFormModal({ cliente, onFechar, onSalvo }: { cliente?: Cliente | null; onFechar: () => void; onSalvo: (cliente: Cliente) => void }) {
  const { dados: bairros } = usePolling<BairroEntrega[]>("/api/entrega/bairros", 60000);
  const [formulario, setFormulario] = useState<ClienteRascunho>(cliente ? {
    nome: cliente.nome, telefone: cliente.telefone ?? "", endereco: cliente.endereco ?? "", bairro: cliente.bairro ?? "", pontoReferencia: cliente.pontoReferencia ?? "", email: cliente.email ?? "", notificarPedido: cliente.notificarPedido,
  } : VAZIO);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  function atualizar(campo: keyof ClienteRascunho, valor: string | boolean) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar() {
    setSalvando(true); setErro("");
    const resposta = await fetch(cliente ? `/api/clientes/${cliente.id}` : "/api/clientes", {
      method: cliente ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formulario),
    });
    const dados = await resposta.json().catch(() => null);
    setSalvando(false);
    if (!resposta.ok) { setErro(dados?.erro ?? "Não foi possível salvar o cliente."); return; }
    onSalvo(dados as Cliente);
  }

  return <div className="of-modal-backdrop z-[70]" role="dialog" aria-modal="true" aria-label={cliente ? "Editar cliente" : "Cadastrar cliente"}>
    <section className="of-modal-panel flex h-[min(90dvh,680px)] max-w-md flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-cream-200 p-5"><div><p className="of-eyebrow">Clientes</p><h2 className="font-display text-xl font-bold tracking-tight text-ink-900">{cliente ? "Editar cliente" : "Novo cliente"}</h2></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-3">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Nome *</span><input value={formulario.nome} onChange={(evento) => atualizar("nome", evento.target.value)} className="of-field" autoFocus /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Telefone *</span><input value={formulario.telefone} onChange={(evento) => atualizar("telefone", evento.target.value)} inputMode="tel" placeholder="(88) 99999-9999" className="of-field" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Endereço</span><input value={formulario.endereco} onChange={(evento) => atualizar("endereco", evento.target.value)} placeholder="Rua, número e complemento" className="of-field" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Bairro</span><select value={formulario.bairro} onChange={(evento) => atualizar("bairro", evento.target.value)} className="of-field"><option value="">Selecione quando aplicável</option>{(bairros ?? []).map((bairro) => <option key={bairro.id} value={bairro.nome}>{bairro.nome}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Ponto de referência</span><input value={formulario.pontoReferencia} onChange={(evento) => atualizar("pontoReferencia", evento.target.value)} className="of-field" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">E-mail</span><input value={formulario.email} onChange={(evento) => atualizar("email", evento.target.value)} inputMode="email" className="of-field" /></label>
        <label className="flex items-start gap-2 rounded-xl bg-cream-50 p-3 text-xs text-ink-700"><input type="checkbox" checked={formulario.notificarPedido} onChange={(evento) => atualizar("notificarPedido", evento.target.checked)} className="mt-0.5" />Aceita receber atualizações do pedido.</label>
        </div>
      </div>
      <footer className="shrink-0 border-t border-cream-200 bg-surface p-5">{erro && <p className="mb-3 rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-700">{erro}</p>}<button onClick={() => void salvar()} disabled={salvando} className="of-btn-primary w-full">{salvando ? "Salvando..." : cliente ? "Salvar alterações" : "Cadastrar cliente"}</button></footer>
    </section>
  </div>;
}
