"use client";

import { useEffect, useState } from "react";
import { CalendarClock, DoorClosed, DoorOpen } from "lucide-react";

type Horarios = { pausado: boolean; forcarAberto: boolean; mensagemPausa: string; turnos: Record<string, { inicio: string; fim: string }[]> };
type Modo = "automatico" | "aberto" | "fechado";

const OPCOES: { id: Modo; titulo: string; descricao: string; icone: typeof DoorOpen }[] = [
  { id: "automatico", titulo: "Pelo horário", descricao: "Abre e fecha sozinho nos horários configurados.", icone: CalendarClock },
  { id: "aberto", titulo: "Aberto", descricao: "Recebe pedidos agora, mesmo fora do horário.", icone: DoorOpen },
  { id: "fechado", titulo: "Fechado", descricao: "Não recebe pedidos até você reabrir.", icone: DoorClosed },
];

function modoDe(dados: Horarios): Modo {
  return dados.pausado ? "fechado" : dados.forcarAberto ? "aberto" : "automatico";
}

export function ControleAberturaCardapio() {
  const [dados, setDados] = useState<Horarios | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/estabelecimento/horarios").then(async (resposta) => {
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(corpo?.erro ?? "Não foi possível carregar o controle do cardápio.");
      setDados(corpo);
    }).catch((e: Error) => setErro(e.message));
  }, []);

  async function escolher(modo: Modo) {
    if (!dados || salvando || modoDe(dados) === modo) return;
    setSalvando(true); setErro("");
    const novo = { ...dados, pausado: modo === "fechado", forcarAberto: modo === "aberto" };
    try {
      const resposta = await fetch("/api/estabelecimento/horarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novo) });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(corpo?.erro ?? "Não foi possível salvar.");
      setDados(corpo);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (!dados) return erro ? <p role="alert" className="mb-6 text-sm text-coral-600">{erro}</p> : null;
  const atual = modoDe(dados);

  return <section className="of-panel mb-6 p-5 sm:p-6" aria-label="Abertura do cardápio">
    <h2 className="font-display text-lg font-semibold text-ink-900">Abertura do cardápio</h2>
    <p className="mt-1 text-sm text-ink-500">Escolha se o cardápio recebe pedidos agora. O horário semanal fica em Configurações.</p>
    <div role="radiogroup" className="mt-4 grid gap-2 sm:grid-cols-3">
      {OPCOES.map(({ id, titulo, descricao, icone: Icone }) => <button key={id} type="button" role="radio" aria-checked={atual === id} disabled={salvando} onClick={() => void escolher(id)}
        className={`flex min-h-11 flex-col items-start gap-1 rounded-2xl border p-3 text-left transition disabled:opacity-60 ${atual === id ? "border-coral-500 bg-coral-050" : "border-cream-200 bg-white hover:border-coral-400"}`}>
        <span className={`flex items-center gap-2 text-sm font-semibold ${atual === id ? "text-coral-600" : "text-ink-800"}`}><Icone size={16} /> {titulo}</span>
        <span className="text-xs text-ink-500">{descricao}</span>
      </button>)}
    </div>
    {erro && <p role="alert" className="mt-3 text-sm text-coral-600">{erro}</p>}
  </section>;
}
