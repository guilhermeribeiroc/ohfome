"use client";

import { useState } from "react";
import { InsumosTable } from "./InsumosTable";
import { PrecificacaoCalculadora } from "./PrecificacaoCalculadora";
import { EstoqueProdutosUnidades } from "./EstoqueProdutosUnidades";
import { MeioAMeioGlobal } from "./MeioAMeioGlobal";
import { FotosProdutos } from "./FotosProdutos";
import { Boxes, Calculator, Camera, PackagePlus, Pizza } from "lucide-react";

const ABAS = [
  { id: "precificacao", label: "Precificação" },
  { id: "insumos", label: "Estoque de insumos" },
  { id: "produtos", label: "Produtos por unidade" },
  { id: "meio", label: "Meio a meio" },
  { id: "fotos", label: "Fotos" },
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

      <div className="of-tabs mb-5 max-w-3xl">
        {ABAS.map((item) => (
          <button
            key={item.id}
            onClick={() => setAba(item.id)}
            data-active={aba === item.id}
            className="of-tab inline-flex items-center justify-center gap-2"
          >
            {item.id === "precificacao" ? <Calculator size={15} /> : item.id === "insumos" ? <Boxes size={15} /> : item.id === "meio" ? <Pizza size={15} /> : item.id === "fotos" ? <Camera size={15} /> : <PackagePlus size={15} />}{item.label}
          </button>
        ))}
      </div>

      {aba === "precificacao" ? <PrecificacaoCalculadora /> : aba === "insumos" ? <InsumosTable /> : aba === "meio" ? <MeioAMeioGlobal /> : aba === "fotos" ? <FotosProdutos /> : <EstoqueProdutosUnidades />}
    </div>
  );
}
