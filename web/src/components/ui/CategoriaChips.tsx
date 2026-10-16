"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Beef, ChevronLeft, ChevronRight, CupSoda, Drumstick, IceCreamCone, LayoutGrid, Pizza, Sandwich, UtensilsCrossed, type LucideIcon } from "lucide-react";

export type CategoriaChip = { valor: string; rotulo: string; quantidade?: number };

// Ícone discreto por tipo de categoria: ajuda a achar o grupo sem ler tudo.
function iconeDaCategoria(rotulo: string, todas: boolean): LucideIcon {
  if (todas) return LayoutGrid;
  const texto = rotulo.toLowerCase();
  if (/pizza/.test(texto)) return Pizza;
  if (/sandu|hamb|burg|lanche|beirute/.test(texto)) return Sandwich;
  if (/bebida|suco|vitamina|jarra|refri|cerveja|drink|agua|água|sucos/.test(texto)) return CupSoda;
  if (/doce|sobremesa|sorvete|a[cç]a[ií]/.test(texto)) return IceCreamCone;
  if (/carne|churrasc|espet/.test(texto)) return Beef;
  if (/frango|salgad|pastel|esfiha|coxinha|por[cç][aã]o/.test(texto)) return Drumstick;
  return UtensilsCrossed;
}

/**
 * Seleção de categorias em uma linha que rola para o lado, com indicação nas pontas, setas no
 * computador, contagem e ícone. A categoria ativa fica em destaque forte e é trazida para o
 * centro. Usado no novo pedido (balcão e delivery) e no Estoque, para ficar igual em todo lugar.
 */
export function CategoriaChips({ itens, valor, onChange, rotulo = "Filtrar por categoria", mostrarIcones = true, modo = "quebra" }: { itens: CategoriaChip[]; valor: string; onChange: (valor: string) => void; rotulo?: string; mostrarIcones?: boolean; modo?: "quebra" | "rolagem" }) {
  const quebra = modo === "quebra";
  const faixaRef = useRef<HTMLDivElement>(null);
  const [podeVoltar, setPodeVoltar] = useState(false);
  const [podeAvancar, setPodeAvancar] = useState(false);

  const medir = useCallback(() => {
    const faixa = faixaRef.current;
    if (!faixa) return;
    setPodeVoltar(faixa.scrollLeft > 4);
    setPodeAvancar(faixa.scrollLeft + faixa.clientWidth < faixa.scrollWidth - 4);
  }, []);

  useEffect(() => {
    medir();
    const faixa = faixaRef.current;
    if (!faixa || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(faixa);
    return () => observador.disconnect();
  }, [medir, itens.length]);

  // Traz a categoria ativa para a vista (sem animar para quem prefere menos movimento).
  useEffect(() => {
    if (quebra) return;
    const ativo = faixaRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    const reduzir = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ativo?.scrollIntoView({ inline: "center", block: "nearest", behavior: reduzir ? "auto" : "smooth" });
  }, [valor, quebra]);

  function rolar(direcao: 1 | -1) {
    const faixa = faixaRef.current;
    if (faixa) faixa.scrollBy({ left: direcao * Math.max(160, faixa.clientWidth * 0.7), behavior: "smooth" });
  }

  if (itens.length < 2) return null;

  return <div className="relative" role="group" aria-label={rotulo}>
    <div ref={faixaRef} onScroll={medir} className={quebra ? "flex flex-wrap gap-1.5 py-0.5" : "flex gap-2 overflow-x-auto scroll-smooth px-0.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}>
      {itens.map((item) => {
        const ativo = item.valor === valor;
        const Icone = iconeDaCategoria(item.rotulo, item.valor === "");
        return <button key={item.valor || "todas"} type="button" aria-pressed={ativo} onClick={() => onChange(item.valor)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border text-[13px] font-semibold ${quebra ? "h-9 px-3" : "h-10 gap-2 px-4"} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-400 focus-visible:ring-offset-1 ${ativo ? "border-ink-900 bg-ink-900 text-white shadow-sm" : "border-cream-200 bg-white text-ink-600 hover:border-coral-300 hover:text-ink-900"}`}>
          {mostrarIcones && <Icone size={15} strokeWidth={2.2} className={ativo ? "text-white" : "text-ink-400"} aria-hidden />}
          <span className="whitespace-nowrap">{item.rotulo}</span>
          {item.quantidade !== undefined && <span className={`min-w-[1.375rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums ${ativo ? "bg-white/20 text-white" : "bg-cream-100 text-ink-500"}`}>{item.quantidade}</span>}
        </button>;
      })}
    </div>
    {!quebra && podeVoltar && <>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent" />
      <button type="button" onClick={() => rolar(-1)} aria-label="Ver categorias anteriores" className="absolute left-0 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-cream-200 bg-white text-ink-600 shadow-sm transition hover:text-ink-900 sm:flex"><ChevronLeft size={16} /></button>
    </>}
    {!quebra && podeAvancar && <>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" />
      <button type="button" onClick={() => rolar(1)} aria-label="Ver mais categorias" className="absolute right-0 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-cream-200 bg-white text-ink-600 shadow-sm transition hover:text-ink-900 sm:flex"><ChevronRight size={16} /></button>
    </>}
  </div>;
}

/**
 * Categorias em coluna (lista vertical): varre-se com o olho bem mais rápido que botões soltos, e a coluna
 * fica parada enquanto os itens rolam ao lado. Pensada para telas largas; no celular use CategoriaChips.
 */
export function CategoriaColuna({ itens, valor, onChange, rotulo = "Categorias" }: { itens: CategoriaChip[]; valor: string; onChange: (valor: string) => void; rotulo?: string }) {
  if (itens.length < 2) return null;
  return <nav aria-label={rotulo}>
    <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-ink-400">{rotulo}</p>
    <ul className="space-y-0.5">
      {itens.map((item) => {
        const ativo = item.valor === valor;
        const Icone = iconeDaCategoria(item.rotulo, item.valor === "");
        return <li key={item.valor || "todas"}>
          <button type="button" aria-pressed={ativo} onClick={() => onChange(item.valor)}
            className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-400 ${ativo ? "bg-ink-900 text-white shadow-sm" : "text-ink-600 hover:bg-cream-100 hover:text-ink-900"}`}>
            <Icone size={15} strokeWidth={2.2} className={`shrink-0 ${ativo ? "text-white" : "text-ink-400"}`} aria-hidden />
            <span className="min-w-0 flex-1 break-words leading-tight">{item.rotulo}</span>
            {item.quantidade !== undefined && <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${ativo ? "bg-white/20 text-white" : "bg-cream-100 text-ink-500"}`}>{item.quantidade}</span>}
          </button>
        </li>;
      })}
    </ul>
  </nav>;
}
