"use client";

import { useState } from "react";
import { InsumosTable } from "./InsumosTable";
import { PrecificacaoCalculadora } from "./PrecificacaoCalculadora";
import { Boxes, Calculator } from "lucide-react";

const ABAS = [
  { id: "precificacao", label: "Precificação" },
  { id: "insumos", label: "Estoque de insumos" },
] as const;

export function EstoqueModule() {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("precificacao");

  return (
    <div className="of-page">
      <div className="of-page-header">
        <div><p className="of-eyebrow">Custos & margem</p>
        <h1 className="of-title">Estoque & Precificação</h1>
        <p className="of-subtitle">Ficha técnica, saldo de insumos e cálculo automático de preços.</p></div>
      </div>

      <div className="of-tabs mb-5 max-w-xl">
        {ABAS.map((item) => (
          <button
            key={item.id}
            onClick={() => setAba(item.id)}
            data-active={aba === item.id}
            className="of-tab inline-flex items-center justify-center gap-2"
          >
            {item.id === "precificacao" ? <Calculator size={15} /> : <Boxes size={15} />}{item.label}
          </button>
        ))}
      </div>

      {aba === "precificacao" ? <PrecificacaoCalculadora /> : <InsumosTable />}
    </div>
  );
}
