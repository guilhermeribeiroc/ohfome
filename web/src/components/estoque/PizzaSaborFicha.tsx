"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Save, Trash2 } from "lucide-react";
import { Interruptor } from "./PizzaConfiguracao";

type Tamanho = { id?: string; nome: string; precoSaborUnico: number; precoMeioAMeio: number | null; permiteMeioAMeio: boolean; ativo: boolean };
type Sabor = { id?: string; nome: string; descricao?: string | null; acrescimo: number; permiteMeioAMeio: boolean; ativo: boolean; precos?: Record<string, number> };
type Config = { regraMeioAMeio: "maior_valor" | "media" | "preco_fixo"; tamanhos: Tamanho[]; sabores: Sabor[] };

const mesmoNome = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Ficha de UM sabor de pizza, no lugar da calculadora: marcar os tamanhos que o
 * sabor tem (P, M, G…) com um toque, digitar o preço de cada um e liberar ou não
 * o meio a meio. Os sabores moram dentro de um produto "Pizza" (que guarda os
 * tamanhos e a regra de preço), mas aqui o dono mexe em um sabor de cada vez.
 */
export function PizzaSaborFicha({ produtoId, nomeSabor, onSalvo, onFechar }: { produtoId: string; nomeSabor: string; onSalvo: (nomeFinal: string | null) => void; onFechar: () => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [nome, setNome] = useState(nomeSabor);
  const [descricao, setDescricao] = useState("");
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [permiteMeio, setPermiteMeio] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);
  const novo = !nomeSabor;

  useEffect(() => {
    setCarregando(true); setErro(""); setSalvo(false);
    fetch(`/api/produtos/${produtoId}/pizza`)
      .then(async (resposta) => {
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados?.erro);
        const carregada = dados as Config;
        setConfig(carregada);
        const existente = carregada.sabores.find((sabor) => mesmoNome(sabor.nome, nomeSabor));
        setNome(existente?.nome ?? nomeSabor);
        setDescricao(existente?.descricao ?? "");
        setPermiteMeio(existente?.permiteMeioAMeio ?? true);
        const inicial: Record<string, string> = {};
        if (existente) {
          for (const tamanho of carregada.tamanhos) {
            const proprio = existente.precos?.[tamanho.nome];
            // Sabor antigo, sem tabela própria: vale o preço do tamanho mais o valor extra.
            const valor = proprio ?? (Object.keys(existente.precos ?? {}).length ? undefined : Number(tamanho.precoSaborUnico) + Number(existente.acrescimo));
            if (valor !== undefined) inicial[tamanho.nome] = String(valor);
          }
        }
        setPrecos(inicial);
      })
      .catch((causa) => setErro(causa instanceof Error ? causa.message : "Não foi possível carregar a pizza."))
      .finally(() => setCarregando(false));
  }, [produtoId, nomeSabor]);

  function alternarTamanho(nomeTamanho: string) {
    setSalvo(false);
    setPrecos((atuais) => {
      if (nomeTamanho in atuais) { const restante = { ...atuais }; delete restante[nomeTamanho]; return restante; }
      return { ...atuais, [nomeTamanho]: "" };
    });
  }

  async function enviar(sabores: Sabor[]) {
    const resposta = await fetch(`/api/produtos/${produtoId}/pizza`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regraMeioAMeio: config?.regraMeioAMeio, tamanhos: config?.tamanhos, sabores }) });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");
  }

  async function salvar() {
    if (!config) return;
    setErro(""); setSalvo(false);
    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 2) { setErro("Digite o nome do sabor."); return; }
    if (config.sabores.some((sabor) => mesmoNome(sabor.nome, nomeLimpo) && !mesmoNome(sabor.nome, nomeSabor))) { setErro("Já existe um sabor com esse nome."); return; }
    const marcados = Object.entries(precos);
    if (!marcados.length) { setErro("Marque ao menos um tamanho (P, M ou G)."); return; }
    if (marcados.some(([, valor]) => !(Number(valor) > 0))) { setErro("Informe o preço de cada tamanho marcado."); return; }
    setSalvando(true);
    try {
      const atualizado: Sabor = {
        nome: nomeLimpo, descricao: descricao.trim() || null, acrescimo: 0, permiteMeioAMeio: permiteMeio, ativo: true,
        precos: Object.fromEntries(marcados.map(([tamanho, valor]) => [tamanho, Number(valor)])),
      };
      const existente = config.sabores.some((sabor) => mesmoNome(sabor.nome, nomeSabor));
      // Sabores antigos sem tabela de preços viram "preço por sabor" ao salvar a pizza inteira.
      const demais = config.sabores.map((sabor) => {
        if (mesmoNome(sabor.nome, nomeSabor) && !novo) return atualizado;
        if (Object.keys(sabor.precos ?? {}).length) return sabor;
        return { ...sabor, precos: Object.fromEntries(config.tamanhos.map((tamanho) => [tamanho.nome, Number(tamanho.precoSaborUnico) + Number(sabor.acrescimo)])) };
      });
      await enviar(existente && !novo ? demais : [...demais, atualizado]);
      setSalvo(true);
      onSalvo(nomeLimpo);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    if (!config || novo || !window.confirm(`Remover o sabor "${nomeSabor}" desta pizza? Pedidos antigos não mudam.`)) return;
    setSalvando(true); setErro("");
    try {
      await enviar(config.sabores.filter((sabor) => !mesmoNome(sabor.nome, nomeSabor)));
      onSalvo(null);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível remover.");
    } finally {
      setSalvando(false);
    }
  }

  return <div className="of-panel p-4 sm:p-5">
    <button type="button" onClick={onFechar} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800"><ArrowLeft size={14} /> Voltar para a pizza</button>
    <p className="of-eyebrow">{novo ? "Novo sabor" : "Sabor de pizza"}</p>
    {carregando ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-ink-400" size={20} /></div> : !config ? <p className="mt-3 rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-700">{erro || "Não foi possível carregar."}</p> : <>
      <label className="mt-2 block text-xs font-semibold text-ink-600">Nome do sabor
        <input value={nome} onChange={(evento) => { setNome(evento.target.value); setSalvo(false); }} placeholder="Ex.: Calabresa" className="of-field mt-1" />
      </label>
      <label className="mt-3 block text-xs font-semibold text-ink-600">Ingredientes <span className="font-normal text-ink-400">(aparece no cardápio)</span>
        <textarea value={descricao} onChange={(evento) => { setDescricao(evento.target.value); setSalvo(false); }} rows={2} placeholder="Ex.: Queijo, calabresa, cebola e orégano" className="of-field mt-1 !min-h-[4.5rem]" />
      </label>

      <div className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">Tamanhos deste sabor</h3>
        <p className="mt-1 text-xs text-ink-500">Toque para marcar os tamanhos que esse sabor tem e digite o preço de cada um.</p>
        <div className="mt-2 space-y-2">
          {config.tamanhos.map((tamanho) => {
            const marcado = tamanho.nome in precos;
            return <div key={tamanho.nome} className={`flex flex-wrap items-center gap-3 rounded-xl border p-2.5 transition ${marcado ? "border-coral-300 bg-coral-050/50" : "border-cream-200 bg-white"}`}>
              <button type="button" aria-pressed={marcado} onClick={() => alternarTamanho(tamanho.nome)} className={`flex min-h-11 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-bold transition ${marcado ? "border-coral-500 bg-coral-500 text-white" : "border-cream-300 bg-white text-ink-600 hover:border-coral-300"}`}>{marcado && <Check size={15} />}{tamanho.nome}</button>
              {marcado ? <label className="relative w-32"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">R$</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={precos[tamanho.nome]} onChange={(evento) => { setSalvo(false); setPrecos((atuais) => ({ ...atuais, [tamanho.nome]: evento.target.value })); }} className="of-field !min-h-10 !pl-9" aria-label={`Preço no tamanho ${tamanho.nome}`} autoFocus={precos[tamanho.nome] === ""} /></label>
                : <span className="text-xs text-ink-400">Este sabor não tem o tamanho {tamanho.nome}</span>}
              {marcado && !tamanho.permiteMeioAMeio && <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-500">Tamanho só inteira</span>}
            </div>;
          })}
        </div>
      </div>

      <label className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-cream-200 bg-cream-50/60 p-3">
        <span><span className="block text-sm font-semibold text-ink-900">Pode ser meio a meio</span><span className="mt-0.5 block text-xs leading-5 text-ink-500">Desligado, este sabor só vai pizza inteira. Os tamanhos que não aceitam meio a meio (como o P) você libera na aba &quot;Meio a meio&quot;.</span></span>
        <Interruptor marcado={permiteMeio} onChange={(valor) => { setPermiteMeio(valor); setSalvo(false); }} rotulo="Sabor pode ser meio a meio" />
      </label>

      {erro && <p className="mt-3 rounded-xl bg-danger-050 px-3 py-2 text-xs text-danger-700">{erro}</p>}
      {salvo && <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">Sabor salvo. Já vale no balcão e no cardápio digital.</p>}
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => void salvar()} disabled={salvando} className="of-btn-primary flex-1">{salvando ? <><Loader2 className="animate-spin" size={15} />Salvando...</> : <><Save size={15} />Salvar sabor</>}</button>
        {!novo && <button type="button" onClick={() => void remover()} disabled={salvando} className="of-icon-btn !h-11 !w-11 text-danger-600" aria-label={`Remover o sabor ${nomeSabor}`}><Trash2 size={16} /></button>}
      </div>
    </>}
  </div>;
}
