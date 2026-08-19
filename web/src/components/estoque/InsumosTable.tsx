"use client";

import { useState } from "react";
import { AlertTriangle, Check, PackagePlus, Plus, Trash2, X } from "lucide-react";
import type { Insumo, UnidadeMedida } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { mascararMoeda, moedaComCentavos, numeroDaMoeda } from "@/lib/moeda";

const UNIDADES: UnidadeMedida[] = ["kg", "g", "l", "ml", "un", "cx", "pct"];
const CAMPO_CLASSE =
  "w-full rounded-xl border border-cream-200 bg-surface px-3.5 py-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-coral-400 focus:ring-4 focus:ring-coral-100";

export function InsumosTable() {
  const { dados, recarregar } = usePolling<Insumo[]>("/api/insumos", 15000);
  const insumos = dados ?? [];
  const baixoEstoque = insumos.filter((i) => i.quantidadeEstoque <= i.quantidadeMinima);
  const [modalAberto, setModalAberto] = useState(false);
  const [entradaAberta, setEntradaAberta] = useState<string | null>(null);
  const [entradaQtd, setEntradaQtd] = useState("");

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir o insumo "${nome}"?`)) return;
    const res = await fetch(`/api/insumos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const dados = await res.json().catch(() => null);
      alert(dados?.erro ?? "Não foi possível excluir.");
      return;
    }
    recarregar();
  }

  async function registrarEntrada(id: string) {
    const quantidade = Number(entradaQtd);
    if (!Number.isFinite(quantidade) || quantidade <= 0) return;
    await fetch(`/api/insumos/${id}/movimentacoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "entrada", quantidade, motivo: "Reposição manual" }),
    });
    setEntradaAberta(null);
    setEntradaQtd("");
    recarregar();
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setModalAberto(true)}
          className="of-btn-primary"
        >
          <Plus size={17} /> Novo insumo
        </button>
      </div>

      {baixoEstoque.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-danger-050 px-4 py-3.5 text-sm font-medium leading-6 text-danger-600 ring-1 ring-danger-400/15">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> <span>{baixoEstoque.length} insumo(s) abaixo do estoque mínimo: {baixoEstoque.map((i) => i.nome).join(", ")}</span>
        </div>
      )}

      <div className="of-panel overflow-hidden">
        <table className="responsive-table w-full text-left text-sm md:min-w-[720px]">
          <thead className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-3.5">Insumo</th>
              <th className="px-4 py-3.5">Saldo</th>
              <th className="px-4 py-3.5">Mínimo</th>
              <th className="px-4 py-3.5">Custo unit.</th>
              <th className="px-4 py-3.5">Fornecedor</th>
              <th className="px-4 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {insumos.map((insumo) => {
              const baixo = insumo.quantidadeEstoque <= insumo.quantidadeMinima;
              return (
                <tr key={insumo.id}>
                  <td className="px-4 py-3 font-medium text-ink-900">{insumo.nome}</td>
                  <td className={`px-4 py-3 font-semibold ${baixo ? "text-danger-600" : "text-ink-600"}`}>
                    {insumo.quantidadeEstoque} {insumo.unidadeMedida}
                  </td>
                  <td className="px-4 py-3 text-ink-400">
                    {insumo.quantidadeMinima} {insumo.unidadeMedida}
                  </td>
                  <td className="px-4 py-3 text-ink-400">R$ {insumo.custoUnitario.toFixed(2).replace(".", ",")}</td>
                  <td className="px-4 py-3 text-ink-400">{insumo.fornecedor ?? "—"}</td>
                  <td className="px-4 py-3">
                    {entradaAberta === insumo.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.001"
                          min={0}
                          autoFocus
                          value={entradaQtd}
                          onChange={(e) => setEntradaQtd(e.target.value)}
                          className="w-16 rounded-lg bg-cream-100 px-1.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-coral-200"
                        />
                        <button
                          onClick={() => registrarEntrada(insumo.id)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-basil-050 text-basil-600 ring-1 ring-basil-400/20"
                          aria-label="Confirmar entrada"
                        >
                          <Check size={15} />
                        </button>
                        <button onClick={() => setEntradaAberta(null)} className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-400 hover:bg-cream-100" aria-label="Cancelar entrada">
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        <button
                          onClick={() => setEntradaAberta(insumo.id)}
                          className="of-btn-secondary !min-h-10 !px-2.5 !text-[11px]"
                        >
                          <PackagePlus size={14} /> Estoque
                        </button>
                        <button onClick={() => excluir(insumo.id, insumo.nome)} className="flex h-10 w-10 items-center justify-center rounded-xl text-danger-600 hover:bg-danger-050" aria-label={`Excluir ${insumo.nome}`}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <NovoInsumoModal
          onFechar={() => setModalAberto(false)}
          onCriado={() => {
            setModalAberto(false);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function NovoInsumoModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeMedida>("un");
  const [quantidadeMinima, setQuantidadeMinima] = useState("0");
  const [custoUnitario, setCustoUnitario] = useState("0");
  const [fornecedor, setFornecedor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar() {
    if (!nome.trim()) return;
    setEnviando(true);
    setErro("");
    const res = await fetch("/api/insumos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome,
        unidadeMedida,
        quantidadeMinima: Number(quantidadeMinima) || 0,
        custoUnitario: numeroDaMoeda(custoUnitario),
        fornecedor,
      }),
    });
    setEnviando(false);
    if (!res.ok) {
      const dados = await res.json().catch(() => null);
      setErro(dados?.erro ?? "Não foi possível criar o insumo.");
      return;
    }
    onCriado();
  }

  return (
    <div className="of-modal-backdrop px-3">
      <div className="of-modal-panel max-w-md overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-200 bg-surface px-5 py-4"><div><p className="of-eyebrow">Estoque</p><p className="font-display text-xl font-bold tracking-tight text-ink-900">Novo insumo</p></div><button onClick={onFechar} className="of-icon-btn" aria-label="Fechar"><X size={17} /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); criar(); }} className="space-y-4 p-5">
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Nome do insumo</span><input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Carne bovina, queijo, farinha" className={CAMPO_CLASSE} /></label>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Unidade</span><select value={unidadeMedida} onChange={(e) => setUnidadeMedida(e.target.value as UnidadeMedida)} className={CAMPO_CLASSE}>{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Estoque mínimo</span><input type="number" inputMode="decimal" step="0.001" min={0} value={quantidadeMinima} onChange={(e) => setQuantidadeMinima(e.target.value)} placeholder="0" className={CAMPO_CLASSE} /></label></div>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Custo por unidade</span><div className="flex min-h-[46px] items-center rounded-xl border border-cream-200 bg-surface px-3.5 transition focus-within:border-coral-400 focus-within:ring-4 focus-within:ring-coral-100"><span className="text-xs font-bold text-ink-400">R$</span><input inputMode="decimal" value={custoUnitario} onChange={(e) => setCustoUnitario(mascararMoeda(e.target.value))} onBlur={() => custoUnitario && setCustoUnitario(moedaComCentavos(custoUnitario))} placeholder="0,00" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-semibold text-ink-900 outline-none" /></div></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-600">Fornecedor <em className="not-italic font-normal text-ink-400">(opcional)</em></span><input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Ex.: Distribuidora Central" className={CAMPO_CLASSE} /></label>
          {erro && <p className="rounded-xl bg-danger-050 px-3 py-2 text-xs font-medium text-danger-600">{erro}</p>}
          <button type="submit" disabled={enviando || !nome.trim()} className="of-btn-primary w-full">{enviando ? "Criando..." : "Criar insumo"}</button>
        </form>
      </div>
    </div>
  );
}
