"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, PackageSearch, Save, Search } from "lucide-react";
import { Interruptor } from "./PizzaConfiguracao";

type ItemApi = { nome: string; permite: boolean; algum: boolean; pizzas: number };
type Resposta = { totalPizzas: number; regraMeioAMeio: "maior_valor" | "media" | null; tamanhos: ItemApi[]; sabores: ItemApi[] };
type Estado = "sim" | "nao" | "misto";
type Regra = "maior_valor" | "media";

const estadoInicial = (item: ItemApi): Estado => item.permite ? "sim" : item.algum ? "misto" : "nao";
const chave = (nome: string) => nome.trim().toLowerCase();

const REGRAS: { valor: Regra; titulo: string; explicacao: string }[] = [
  { valor: "maior_valor", titulo: "Cobrar o sabor mais caro", explicacao: "Ex.: ½ Calabresa (R$ 30) + ½ Portuguesa (R$ 34) = R$ 34." },
  { valor: "media", titulo: "Média dos dois sabores", explicacao: "Ex.: ½ Calabresa (R$ 30) + ½ Portuguesa (R$ 34) = R$ 32." },
];

function Linha({ nome, detalhe, estado, onChange }: { nome: string; detalhe: string; estado: Estado; onChange: (estado: Estado) => void }) {
  return <div className="flex items-center justify-between gap-3 px-3 py-2.5">
    <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{nome}</p><p className="text-[11px] text-ink-400">{detalhe}</p></div>
    <div className="flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-600">
      {estado === "misto" ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Só em algumas</span> : <span>{estado === "sim" ? "Aceita" : "Só inteira"}</span>}
      <Interruptor marcado={estado === "sim"} onChange={(valor) => onChange(valor ? "sim" : "nao")} rotulo={`${nome} aceita meio a meio`} />
    </div>
  </div>;
}

export function MeioAMeioGlobal() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [tamanhos, setTamanhos] = useState<Record<string, Estado>>({});
  const [sabores, setSabores] = useState<Record<string, Estado>>({});
  const [regra, setRegra] = useState<Regra | null>(null);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);

  function aplicar(resposta: Resposta) {
    setDados(resposta);
    setTamanhos(Object.fromEntries(resposta.tamanhos.map((item) => [chave(item.nome), estadoInicial(item)])));
    setSabores(Object.fromEntries(resposta.sabores.map((item) => [chave(item.nome), estadoInicial(item)])));
    setRegra(resposta.regraMeioAMeio);
  }

  useEffect(() => {
    fetch("/api/pizzas/meio-a-meio")
      .then(async (resposta) => { const corpo = await resposta.json().catch(() => null); if (!resposta.ok) throw new Error(corpo?.erro ?? "Não foi possível carregar."); aplicar(corpo); })
      .catch((causa) => setErro(causa instanceof Error ? causa.message : "Não foi possível carregar."))
      .finally(() => setCarregando(false));
  }, []);

  const saboresVisiveis = useMemo(() => (dados?.sabores ?? []).filter((sabor) => sabor.nome.toLowerCase().includes(busca.trim().toLowerCase())), [dados, busca]);
  const totalSaboresMeio = Object.values(sabores).filter((estado) => estado === "sim").length;

  function marcarTodosSabores(estado: Estado) {
    setSalvo(false);
    setSabores((atuais) => Object.fromEntries(Object.keys(atuais).map((nome) => [nome, estado])));
  }

  async function salvar() {
    setErro(""); setSalvo(false); setSalvando(true);
    // "Só em algumas" que o usuário não mexeu fica de fora: cada pizza mantém o que já tem.
    const enviar = (itens: ItemApi[], estados: Record<string, Estado>) => itens.filter((item) => estados[chave(item.nome)] !== "misto").map((item) => ({ nome: item.nome, permite: estados[chave(item.nome)] === "sim" }));
    try {
      const resposta = await fetch("/api/pizzas/meio-a-meio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tamanhos: enviar(dados?.tamanhos ?? [], tamanhos), sabores: enviar(dados?.sabores ?? [], sabores), ...(regra ? { regraMeioAMeio: regra } : {}) }) });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(corpo?.erro ?? "Não foi possível salvar.");
      aplicar(corpo); setSalvo(true);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <div className="of-panel flex min-h-52 items-center justify-center"><Loader2 className="animate-spin text-ink-400" size={20} /></div>;
  if (!dados?.totalPizzas) return <div className="of-panel flex min-h-52 flex-col items-center justify-center px-6 text-center"><PackageSearch size={26} className="mb-3 text-ink-400" /><p className="text-sm font-semibold text-ink-600">Nenhuma pizza configurada ainda</p><p className="mt-1 max-w-sm text-xs leading-5 text-ink-400">Cadastre uma pizza na aba Precificação (tamanhos e sabores). Depois você libera ou bloqueia o meio a meio de todas por aqui.</p>{erro && <p className="mt-3 text-xs text-danger-600">{erro}</p>}</div>;

  return <section className="of-panel overflow-hidden">
    <header className="border-b border-cream-100 px-4 py-4 sm:px-5">
      <p className="font-display text-lg font-bold text-ink-900">Meio a meio de todas as pizzas</p>
      <p className="mt-1 text-xs leading-5 text-ink-500">Configure uma vez aqui e vale para as {dados.totalPizzas} {dados.totalPizzas === 1 ? "pizza cadastrada" : "pizzas cadastradas"}, sem abrir produto por produto. Se mudar o &quot;P&quot; aqui, muda o &quot;P&quot; de todas.</p>
    </header>

    <div className="space-y-6 p-4 sm:p-5">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">1. Em quais tamanhos pode ser meio a meio?</h3>
        <div className="mt-2 divide-y divide-cream-100 rounded-xl border border-cream-200 bg-white">
          {dados.tamanhos.map((item) => <Linha key={item.nome} nome={`Tamanho ${item.nome}`} detalhe={`${item.pizzas} ${item.pizzas === 1 ? "pizza" : "pizzas"}`} estado={tamanhos[chave(item.nome)] ?? "sim"} onChange={(estado) => { setSalvo(false); setTamanhos((atuais) => ({ ...atuais, [chave(item.nome)]: estado })); }} />)}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">2. Quais sabores podem ser combinados?</h3>
            <p className="mt-1 text-xs text-ink-500">{totalSaboresMeio} de {dados.sabores.length} sabores aceitam meio a meio. &quot;Só inteira&quot; impede a combinação com qualquer outro.</p>
          </div>
          <div className="flex gap-2 text-[11px] font-semibold">
            <button type="button" onClick={() => marcarTodosSabores("sim")} className="rounded-full border border-cream-300 bg-white px-2.5 py-1 text-ink-600 hover:border-coral-300">Todos aceitam</button>
            <button type="button" onClick={() => marcarTodosSabores("nao")} className="rounded-full border border-cream-300 bg-white px-2.5 py-1 text-ink-600 hover:border-coral-300">Nenhum aceita</button>
          </div>
        </div>
        {dados.sabores.length > 6 && <div className="relative mt-2"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar sabor" aria-label="Buscar sabor" className="of-field !min-h-10 !pl-9" /></div>}
        <div className="mt-2 max-h-[420px] divide-y divide-cream-100 overflow-y-auto rounded-xl border border-cream-200 bg-white">
          {saboresVisiveis.map((item) => <Linha key={item.nome} nome={item.nome} detalhe={`${item.pizzas} ${item.pizzas === 1 ? "pizza" : "pizzas"}`} estado={sabores[chave(item.nome)] ?? "sim"} onChange={(estado) => { setSalvo(false); setSabores((atuais) => ({ ...atuais, [chave(item.nome)]: estado })); }} />)}
          {!saboresVisiveis.length && <p className="px-3 py-4 text-center text-xs text-ink-500">Nenhum sabor com esse nome.</p>}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">3. Quanto cobrar no meio a meio?</h3>
        {!dados.regraMeioAMeio && <p className="mt-1 text-xs text-amber-700">Hoje as pizzas têm regras diferentes (ou preço próprio por tamanho). Escolher uma opção abaixo aplica em todas; sem escolher, nada muda.</p>}
        <div className="mt-2 grid gap-2">
          {REGRAS.map((opcao) => <label key={opcao.valor} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${regra === opcao.valor ? "border-coral-500 bg-coral-050/60" : "border-cream-200 bg-white hover:border-coral-300"}`}>
            <input type="radio" name="regra-global" checked={regra === opcao.valor} onChange={() => { setRegra(opcao.valor); setSalvo(false); }} className="mt-1" />
            <span><span className="block text-sm font-semibold text-ink-900">{opcao.titulo}</span><span className="mt-0.5 block text-xs leading-5 text-ink-500">{opcao.explicacao}</span></span>
          </label>)}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-ink-400">Preço próprio por tamanho continua sendo definido dentro de cada pizza, na aba Precificação.</p>
      </div>

      {erro && <p className="rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-700">{erro}</p>}
      {salvo && <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">Salvo. Já vale em todas as pizzas, no balcão, delivery e cardápio digital.</p>}
      <button type="button" onClick={() => void salvar()} disabled={salvando} className="of-btn-primary w-full">{salvando ? <><Loader2 className="animate-spin" size={15} />Salvando...</> : <><Save size={15} />Salvar para todas as pizzas</>}</button>
    </div>
  </section>;
}
