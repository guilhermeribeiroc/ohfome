"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Save, Search, Trash2 } from "lucide-react";

type Regra = "maior_valor" | "media" | "preco_fixo";
type Tamanho = { id?: string; nome: string; precoSaborUnico: number; precoMeioAMeio: number | null; permiteMeioAMeio: boolean; ativo: boolean };
type Sabor = { id?: string; nome: string; descricao?: string | null; acrescimo: number; permiteMeioAMeio: boolean; ativo: boolean; precos?: Record<string, number> };

// Tamanhos mais comuns: um clique cria o tamanho, sem digitar nada.
const TAMANHOS_RAPIDOS = [
  { nome: "P", descricao: "Pequena" },
  { nome: "M", descricao: "Média" },
  { nome: "G", descricao: "Grande" },
];

const REGRAS: { valor: Regra; titulo: string; explicacao: string }[] = [
  { valor: "maior_valor", titulo: "Cobrar o sabor mais caro", explicacao: "Ex.: ½ Calabresa (R$ 30) + ½ Portuguesa (R$ 34) = R$ 34." },
  { valor: "media", titulo: "Média dos dois sabores", explicacao: "Ex.: ½ Calabresa (R$ 30) + ½ Portuguesa (R$ 34) = R$ 32." },
  { valor: "preco_fixo", titulo: "Preço próprio por tamanho", explicacao: "Você digita o preço do meio a meio em cada tamanho." },
];

const novoTamanho = (nome: string): Tamanho => ({ nome, precoSaborUnico: 0, precoMeioAMeio: null, permiteMeioAMeio: true, ativo: true });
const novoSabor = (nome: string): Sabor => ({ nome, acrescimo: 0, permiteMeioAMeio: true, ativo: true, precos: {} });
const dinheiro = (valor: number) => `R$ ${valor.toFixed(2).replace(".", ",")}`;

export function Interruptor({ marcado, onChange, rotulo }: { marcado: boolean; onChange: (valor: boolean) => void; rotulo: string }) {
  return <button type="button" role="switch" aria-checked={marcado} aria-label={rotulo} onClick={() => onChange(!marcado)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${marcado ? "bg-emerald-500" : "bg-ink-200"}`}>
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${marcado ? "left-[22px]" : "left-0.5"}`} />
  </button>;
}

export function PizzaConfiguracao({ produtoId, tipoProduto, onSalvo }: { produtoId: string; tipoProduto?: string; onSalvo: () => void }) {
  const [ativa, setAtiva] = useState(tipoProduto === "pizza");
  const [regra, setRegra] = useState<Regra>("maior_valor");
  const [tamanhos, setTamanhos] = useState<Tamanho[]>([]);
  const [sabores, setSabores] = useState<Sabor[]>([]);
  // Quando ligado, cada sabor tem o seu preço em cada tamanho (como numa tabela de cardápio impresso).
  const [precoPorSabor, setPrecoPorSabor] = useState(false);
  const [outroTamanho, setOutroTamanho] = useState("");
  const [novoSaborNome, setNovoSaborNome] = useState("");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(tipoProduto === "pizza");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (tipoProduto !== "pizza") return;
    fetch(`/api/produtos/${produtoId}/pizza`)
      .then(async (resposta) => {
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados?.erro);
        setRegra(dados.regraMeioAMeio);
        setTamanhos(dados.tamanhos);
        setSabores(dados.sabores);
        setPrecoPorSabor((dados.sabores as Sabor[]).some((sabor) => Object.keys(sabor.precos ?? {}).length > 0));
      })
      .catch((causa) => setErro(causa instanceof Error ? causa.message : "Não foi possível carregar a pizza."))
      .finally(() => setCarregando(false));
  }, [produtoId, tipoProduto]);

  const nomesTamanhos = useMemo(() => new Set(tamanhos.map((tamanho) => tamanho.nome.trim().toLowerCase())), [tamanhos]);
  const outrosTamanhos = tamanhos.filter((tamanho) => !TAMANHOS_RAPIDOS.some((rapido) => rapido.nome.toLowerCase() === tamanho.nome.trim().toLowerCase()));
  const saboresVisiveis = sabores.map((sabor, indice) => ({ sabor, indice })).filter(({ sabor }) => sabor.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const totalSaboresMeio = sabores.filter((sabor) => sabor.permiteMeioAMeio).length;

  function alternarTamanhoRapido(nome: string) {
    setSalvo(false);
    setTamanhos((atuais) => atuais.some((item) => item.nome.trim().toLowerCase() === nome.toLowerCase())
      ? atuais.filter((item) => item.nome.trim().toLowerCase() !== nome.toLowerCase())
      : [...atuais, novoTamanho(nome)]);
  }

  function adicionarOutroTamanho() {
    const nome = outroTamanho.trim();
    if (!nome || nomesTamanhos.has(nome.toLowerCase())) return;
    setSalvo(false);
    setTamanhos((atuais) => [...atuais, novoTamanho(nome)]);
    setOutroTamanho("");
  }

  function alterarTamanho(nome: string, patch: Partial<Tamanho>) {
    setSalvo(false);
    setTamanhos((atuais) => atuais.map((item) => item.nome === nome ? { ...item, ...patch } : item));
  }

  function alterarSabor(indice: number, patch: Partial<Sabor>) {
    setSalvo(false);
    setSabores((atuais) => atuais.map((item, i) => i === indice ? { ...item, ...patch } : item));
  }

  function alterarPrecoSabor(indice: number, tamanho: string, valor: string) {
    setSalvo(false);
    setSabores((atuais) => atuais.map((item, i) => {
      if (i !== indice) return item;
      const precos = { ...(item.precos ?? {}) };
      if (valor === "") delete precos[tamanho]; else precos[tamanho] = Number(valor);
      return { ...item, precos };
    }));
  }

  function adicionarSabor() {
    const nome = novoSaborNome.trim();
    if (nome.length < 2) return;
    setSalvo(false);
    setSabores((atuais) => [...atuais, novoSabor(nome)]);
    setNovoSaborNome("");
  }

  async function salvar() {
    setErro(""); setSalvo(false);
    if (!tamanhos.length) { setErro("Marque ao menos um tamanho (P, M ou G)."); return; }
    if (!sabores.length) { setErro("Adicione ao menos um sabor."); return; }
    if (!precoPorSabor && tamanhos.some((tamanho) => !(tamanho.precoSaborUnico > 0))) { setErro("Informe o preço de cada tamanho marcado."); return; }
    if (precoPorSabor) {
      const semPreco = sabores.find((sabor) => tamanhos.some((tamanho) => !((sabor.precos ?? {})[tamanho.nome] > 0)));
      if (semPreco) { setErro(`Preencha o preço do sabor "${semPreco.nome}" em todos os tamanhos.`); return; }
    }
    if (regra === "preco_fixo" && tamanhos.some((tamanho) => tamanho.permiteMeioAMeio && !(Number(tamanho.precoMeioAMeio) > 0))) { setErro("Informe o preço do meio a meio nos tamanhos que aceitam meio a meio."); return; }
    setSalvando(true);
    try {
      // Com preço por sabor, o preço base do tamanho vira o menor preço dele ("a partir de" no cardápio).
      const nomesAtuais = new Set(tamanhos.map((tamanho) => tamanho.nome));
      const tamanhosEnvio = precoPorSabor ? tamanhos.map((tamanho) => ({ ...tamanho, precoSaborUnico: Math.min(...sabores.map((sabor) => (sabor.precos ?? {})[tamanho.nome]).filter((valor) => valor > 0)) })) : tamanhos;
      const saboresEnvio = sabores.map((sabor) => ({ ...sabor, precos: precoPorSabor ? Object.fromEntries(Object.entries(sabor.precos ?? {}).filter(([nome]) => nomesAtuais.has(nome))) : {} }));
      const resposta = await fetch(`/api/produtos/${produtoId}/pizza`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regraMeioAMeio: regra, tamanhos: tamanhosEnvio, sabores: saboresEnvio }) });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");
      setAtiva(true); setTamanhos(dados.tamanhos); setSabores(dados.sabores); setPrecoPorSabor((dados.sabores as Sabor[]).some((sabor) => Object.keys(sabor.precos ?? {}).length > 0)); setSalvo(true); onSalvo();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return <section className="mt-4 rounded-2xl border border-cream-200 bg-surface p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-ink-900">Pizza com vários tamanhos e sabores</h3>
        <p className="mt-1 text-xs leading-5 text-ink-500">Cadastre a pizza uma vez só. O cliente escolhe o tamanho e o sabor na hora do pedido, no balcão, no delivery e no cardápio digital. Não precisa criar &quot;Calabresa P&quot;, &quot;Calabresa M&quot; e &quot;Calabresa G&quot;.</p>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-700"><input type="checkbox" checked={ativa} onChange={(evento) => setAtiva(evento.target.checked)} /> Ativar</label>
    </div>

    {ativa && (carregando ? <div className="flex justify-center py-6"><Loader2 className="animate-spin text-ink-400" size={18} /></div> : <>
      <div className="mt-5">
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">1. Quais tamanhos você vende?</h4>
        <p className="mt-1 text-xs text-ink-500">Toque para marcar. Não precisa digitar nada.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAMANHOS_RAPIDOS.map((rapido) => {
            const marcado = nomesTamanhos.has(rapido.nome.toLowerCase());
            return <button key={rapido.nome} type="button" aria-pressed={marcado} onClick={() => alternarTamanhoRapido(rapido.nome)} className={`flex min-h-11 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-xl border px-4 text-sm font-bold transition ${marcado ? "border-coral-500 bg-coral-050 text-coral-700" : "border-cream-300 bg-white text-ink-600 hover:border-coral-300"}`}>
              {marcado && <Check size={15} />}{rapido.nome}<span className="text-[11px] font-medium opacity-70">{rapido.descricao}</span>
            </button>;
          })}
          {outrosTamanhos.map((tamanho) => <button key={tamanho.nome} type="button" aria-pressed onClick={() => alternarTamanhoRapido(tamanho.nome)} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-coral-500 bg-coral-050 px-4 text-sm font-bold text-coral-700"><Check size={15} />{tamanho.nome}</button>)}
        </div>
        <div className="mt-2 flex gap-2">
          <input value={outroTamanho} onChange={(evento) => setOutroTamanho(evento.target.value)} onKeyDown={(evento) => { if (evento.key === "Enter") { evento.preventDefault(); adicionarOutroTamanho(); } }} placeholder="Outro tamanho (ex.: Família)" className="of-field !min-h-10 flex-1" aria-label="Nome de outro tamanho" />
          <button type="button" onClick={adicionarOutroTamanho} className="of-btn-secondary !min-h-10 !px-3 !text-xs"><Plus size={14} /> Adicionar</button>
        </div>

        {tamanhos.length > 0 && <div className="mt-3 space-y-2">
          {tamanhos.map((tamanho) => <div key={tamanho.nome} className="rounded-xl border border-cream-200 bg-cream-50/60 p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="min-w-[3rem] text-sm font-bold text-ink-900">{tamanho.nome}</p>
              {!precoPorSabor && <label className="flex items-center gap-2 text-xs font-semibold text-ink-600">Preço com 1 sabor
                <span className="relative w-28"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">R$</span>
                  <input type="number" min="0" step="0.01" value={tamanho.precoSaborUnico || ""} onChange={(evento) => alterarTamanho(tamanho.nome, { precoSaborUnico: Number(evento.target.value) })} className="of-field !min-h-9 !pl-9" aria-label={`Preço do tamanho ${tamanho.nome}`} /></span>
              </label>}
              <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-ink-600">Aceita meio a meio
                <Interruptor marcado={tamanho.permiteMeioAMeio} onChange={(valor) => alterarTamanho(tamanho.nome, { permiteMeioAMeio: valor })} rotulo={`Tamanho ${tamanho.nome} aceita meio a meio`} />
              </label>
            </div>
            {regra === "preco_fixo" && tamanho.permiteMeioAMeio && <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink-600">Preço do meio a meio
              <span className="relative w-28"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">R$</span>
                <input type="number" min="0" step="0.01" value={tamanho.precoMeioAMeio ?? ""} onChange={(evento) => alterarTamanho(tamanho.nome, { precoMeioAMeio: evento.target.value === "" ? null : Number(evento.target.value) })} className="of-field !min-h-9 !pl-9" aria-label={`Preço do meio a meio no tamanho ${tamanho.nome}`} /></span>
            </label>}
          </div>)}
        </div>}
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">2. Quais sabores essa pizza tem?</h4>
            <p className="mt-1 text-xs text-ink-500">{sabores.length ? `${sabores.length} sabores, ${totalSaboresMeio} aceitam meio a meio.` : "Digite o sabor e aperte Enter."}</p>
          </div>
          {sabores.length > 0 && <div className="flex gap-2 text-[11px] font-semibold">
            <button type="button" onClick={() => { setSalvo(false); setSabores((atuais) => atuais.map((sabor) => ({ ...sabor, permiteMeioAMeio: true }))); }} className="rounded-full border border-cream-300 bg-white px-2.5 py-1 text-ink-600 hover:border-coral-300">Todos aceitam meio a meio</button>
            <button type="button" onClick={() => { setSalvo(false); setSabores((atuais) => atuais.map((sabor) => ({ ...sabor, permiteMeioAMeio: false }))); }} className="rounded-full border border-cream-300 bg-white px-2.5 py-1 text-ink-600 hover:border-coral-300">Nenhum aceita</button>
          </div>}
        </div>

        <div className="mt-2 flex gap-2">
          <input value={novoSaborNome} onChange={(evento) => setNovoSaborNome(evento.target.value)} onKeyDown={(evento) => { if (evento.key === "Enter") { evento.preventDefault(); adicionarSabor(); } }} placeholder="Novo sabor (ex.: Calabresa)" className="of-field !min-h-10 flex-1" aria-label="Nome do novo sabor" />
          <button type="button" onClick={adicionarSabor} className="of-btn-secondary !min-h-10 !px-3 !text-xs"><Plus size={14} /> Sabor</button>
        </div>

        <label className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-cream-200 bg-cream-50/60 p-3">
          <span><span className="block text-sm font-semibold text-ink-900">Cada sabor tem seu preço em cada tamanho</span><span className="mt-0.5 block text-xs leading-5 text-ink-500">Ligue se o seu cardápio tem uma tabela (ex.: Maravilha P 20, M 26, G 36 e Mista P 20, M 25, G 32). Desligado, o preço é o do tamanho mais o valor extra do sabor.</span></span>
          <Interruptor marcado={precoPorSabor} onChange={(valor) => { setPrecoPorSabor(valor); setSalvo(false); }} rotulo="Preço por sabor e tamanho" />
        </label>
        {sabores.length > 6 && <div className="relative mt-2"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar sabor" className="of-field !min-h-10 !pl-9" aria-label="Buscar sabor" /></div>}

        {sabores.length > 0 && <div className="mt-3 divide-y divide-cream-100 rounded-xl border border-cream-200 bg-white">
          {!precoPorSabor && <div className="hidden grid-cols-[1fr_7.5rem_9rem_2.25rem] gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-400 sm:grid"><span>Sabor</span><span>Valor extra</span><span>Meio a meio</span><span /></div>}
          {saboresVisiveis.map(({ sabor, indice }) => <div key={sabor.id ?? `${sabor.nome}-${indice}`} className={`grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 ${precoPorSabor ? "" : "sm:grid-cols-[1fr_7.5rem_9rem_2.25rem]"}`}>
            <input value={sabor.nome} onChange={(evento) => alterarSabor(indice, { nome: evento.target.value })} className="of-field !min-h-9" aria-label="Nome do sabor" />
            <button type="button" onClick={() => { setSalvo(false); setSabores((atuais) => atuais.filter((_, i) => i !== indice)); }} className={`of-icon-btn text-danger-600 ${precoPorSabor ? "" : "sm:order-last"}`} aria-label={`Remover sabor ${sabor.nome}`}><Trash2 size={14} /></button>
            {precoPorSabor && <div className="col-span-2 flex flex-wrap gap-2">{tamanhos.map((tamanho) => <label key={tamanho.nome} className="flex items-center gap-1.5 text-[11px] font-bold text-ink-500">{tamanho.nome}<span className="relative w-24"><span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-ink-400">R$</span><input type="number" min="0" step="0.01" value={(sabor.precos ?? {})[tamanho.nome] ?? ""} onChange={(evento) => alterarPrecoSabor(indice, tamanho.nome, evento.target.value)} className="of-field !min-h-9 !pl-8 !pr-1" aria-label={`Preço de ${sabor.nome} no tamanho ${tamanho.nome}`} /></span></label>)}</div>}
            {!precoPorSabor && <label className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">+ R$</span>
              <input type="number" min="0" step="0.01" value={sabor.acrescimo || ""} placeholder="0" onChange={(evento) => alterarSabor(indice, { acrescimo: Number(evento.target.value) })} className="of-field !min-h-9 !pl-11" aria-label={`Valor extra do sabor ${sabor.nome}`} /></label>}
            <label className={`flex items-center gap-2 text-xs font-semibold text-ink-600 ${precoPorSabor ? "col-span-2 justify-start" : "justify-end sm:justify-start"}`}>{sabor.permiteMeioAMeio ? "Aceita" : "Só inteira"}
              <Interruptor marcado={sabor.permiteMeioAMeio} onChange={(valor) => alterarSabor(indice, { permiteMeioAMeio: valor })} rotulo={`Sabor ${sabor.nome} aceita meio a meio`} /></label>
          </div>)}
          {!saboresVisiveis.length && <p className="px-3 py-4 text-center text-xs text-ink-500">Nenhum sabor com esse nome. Tente outra busca.</p>}
        </div>}
        <p className="mt-2 text-[11px] leading-4 text-ink-400">Valor extra: quanto esse sabor soma ao preço do tamanho. Deixe em branco se não custa mais. &quot;Só inteira&quot; impede que o sabor seja combinado com outro.</p>
      </div>

      <div className="mt-6">
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">3. Quanto cobrar no meio a meio?</h4>
        <div className="mt-2 grid gap-2">
          {REGRAS.map((opcao) => <label key={opcao.valor} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${regra === opcao.valor ? "border-coral-500 bg-coral-050/60" : "border-cream-200 bg-white hover:border-coral-300"}`}>
            <input type="radio" name={`regra-${produtoId}`} checked={regra === opcao.valor} onChange={() => { setRegra(opcao.valor); setSalvo(false); }} className="mt-1" />
            <span><span className="block text-sm font-semibold text-ink-900">{opcao.titulo}</span><span className="mt-0.5 block text-xs leading-5 text-ink-500">{opcao.explicacao}</span></span>
          </label>)}
        </div>
      </div>

      {tamanhos.length > 0 && <p className="mt-5 rounded-xl bg-cream-50 px-3 py-2.5 text-xs leading-5 text-ink-600"><b>Assim aparece para o cliente:</b> Pizza · {tamanhos.map((tamanho) => `${tamanho.nome}${tamanho.precoSaborUnico > 0 ? ` ${dinheiro(tamanho.precoSaborUnico)}` : ""}`).join(" / ")}</p>}
      {erro && <p className="mt-3 rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-700">{erro}</p>}
      {salvo && <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">Pizza salva. Já vale em todos os pedidos.</p>}
      <button type="button" onClick={() => void salvar()} disabled={salvando} className="of-btn-primary mt-5 w-full">{salvando ? <><Loader2 className="animate-spin" size={15} />Salvando...</> : <><Save size={15} />Salvar pizza</>}</button>
    </>)}
  </section>;
}
