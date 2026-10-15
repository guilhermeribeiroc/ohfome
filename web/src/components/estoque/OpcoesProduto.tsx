"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

type Opcao = { id?: string; nome: string; acrescimo: number; ativo: boolean; ordem?: number };
type Grupo = { id?: string; nome: string; minimoSelecoes: number; maximoSelecoes: number; ativo: boolean; ordem?: number; opcoes: Opcao[] };

// Modelos prontos: um toque cria a pergunta já configurada.
const MODELOS: { rotulo: string; grupo: () => Grupo }[] = [
  { rotulo: "Escolha do pão", grupo: () => ({ nome: "Escolha seu pão", minimoSelecoes: 1, maximoSelecoes: 1, ativo: true, opcoes: [{ nome: "", acrescimo: 0, ativo: true }] }) },
  { rotulo: "Adicionais", grupo: () => ({ nome: "Adicionais", minimoSelecoes: 0, maximoSelecoes: 5, ativo: true, opcoes: [{ nome: "Bacon", acrescimo: 4, ativo: true }, { nome: "Queijo extra", acrescimo: 3, ativo: true }] }) },
  { rotulo: "Molho", grupo: () => ({ nome: "Escolha o molho", minimoSelecoes: 0, maximoSelecoes: 2, ativo: true, opcoes: [{ nome: "", acrescimo: 0, ativo: true }] }) },
  { rotulo: "Ponto da carne", grupo: () => ({ nome: "Ponto da carne", minimoSelecoes: 1, maximoSelecoes: 1, ativo: true, opcoes: [{ nome: "Mal passada", acrescimo: 0, ativo: true }, { nome: "Ao ponto", acrescimo: 0, ativo: true }, { nome: "Bem passada", acrescimo: 0, ativo: true }] }) },
];

function previaGrupo(grupo: Grupo) {
  const opcoes = grupo.opcoes.filter((opcao) => opcao.nome.trim());
  if (!grupo.nome.trim() || !opcoes.length) return "";
  const regra = grupo.minimoSelecoes > 0 ? (grupo.maximoSelecoes <= 1 ? "escolha 1 (obrigatório)" : `escolha de ${grupo.minimoSelecoes} a ${grupo.maximoSelecoes} (obrigatório)`) : `opcional, até ${grupo.maximoSelecoes}`;
  return `${grupo.nome.trim()} — ${regra}: ${opcoes.map((opcao) => `${opcao.nome.trim()}${opcao.acrescimo > 0 ? ` (+R$ ${opcao.acrescimo.toFixed(2).replace(".", ",")})` : ""}`).join(" · ")}`;
}

const novoGrupo = (): Grupo => ({ nome: "", minimoSelecoes: 0, maximoSelecoes: 1, ativo: true, opcoes: [{ nome: "", acrescimo: 0, ativo: true }] });

// Sugestões pra não digitar o mesmo tipo de pão em cada sanduíche/hambúrguer
// cadastrado — só aparecem quando o nome do grupo sugere escolha de pão.
const SUGESTOES_PAO = ["Bola", "Brioche", "Árabe", "Integral", "Australiano", "Baguete", "Hot dog"];
const REGEX_GRUPO_PAO = /p[ãa]o/i;

export function OpcoesProduto({ produtoId }: { produtoId: string }) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch(`/api/produtos/${produtoId}/opcoes`).then(async (resposta) => {
      const dados = await resposta.json().catch(() => []);
      if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível carregar as opções.");
      if (ativo) setGrupos(Array.isArray(dados) ? dados : []);
    }).catch((causa) => { if (ativo) setErro(causa instanceof Error ? causa.message : "Não foi possível carregar as opções."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [produtoId]);

  function alterarGrupo(indice: number, patch: Partial<Grupo>) { setGrupos((atuais) => atuais.map((grupo, i) => i === indice ? { ...grupo, ...patch } : grupo)); }
  function adicionarSugestao(grupoIndice: number, nome: string) {
    setGrupos((atuais) => atuais.map((grupo, i) => {
      if (i !== grupoIndice || grupo.opcoes.some((opcao) => opcao.nome.trim().toLowerCase() === nome.toLowerCase())) return grupo;
      const semVazia = grupo.opcoes.filter((opcao) => opcao.nome.trim());
      return { ...grupo, opcoes: [...semVazia, { nome, acrescimo: 0, ativo: true }] };
    }));
  }
  function alterarOpcao(grupoIndice: number, opcaoIndice: number, patch: Partial<Opcao>) { setGrupos((atuais) => atuais.map((grupo, i) => i !== grupoIndice ? grupo : { ...grupo, opcoes: grupo.opcoes.map((opcao, j) => j === opcaoIndice ? { ...opcao, ...patch } : opcao) })); }
  async function salvar() {
    setSalvando(true); setErro(""); setSalvo("");
    try {
      const resposta = await fetch(`/api/produtos/${produtoId}/opcoes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grupos }) });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível salvar as opções.");
      setGrupos(dados); setSalvo("Perguntas salvas.");
    } catch (causa) { setErro(causa instanceof Error ? causa.message : "Não foi possível salvar as opções."); }
    finally { setSalvando(false); }
  }

  return <section className="mt-4 rounded-2xl border border-cream-200 bg-surface p-4">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-ink-900">Perguntas ao cliente (pão, adicionais, molhos)</h3><p className="mt-1 text-xs leading-5 text-ink-500">Use quando o cliente precisa escolher algo ao pedir este produto. Ex.: pergunta &quot;Escolha seu pão&quot; com as opções Brioche e Integral, ou &quot;Adicionais&quot; com Bacon (+ R$ 4). Se o produto não tem escolhas, deixe em branco.</p></div><button type="button" onClick={() => setGrupos((atuais) => [...atuais, novoGrupo()])} className="of-btn-secondary shrink-0 !min-h-9 !px-3 !text-xs"><Plus size={14} /> Nova pergunta</button></div>
    {!carregando && <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-semibold text-ink-500">Começar com um modelo:</span>{MODELOS.map((modelo) => <button key={modelo.rotulo} type="button" onClick={() => setGrupos((atuais) => [...atuais, modelo.grupo()])} className="rounded-full border border-cream-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-coral-300 hover:text-coral-700">+ {modelo.rotulo}</button>)}</div>}
    {carregando ? <div className="flex justify-center py-6"><Loader2 className="animate-spin text-ink-400" size={18} /></div> : !grupos.length ? <p className="mt-4 rounded-xl bg-cream-50 px-3 py-3 text-xs text-ink-500">Ainda não há perguntas. Toque em &quot;Nova pergunta&quot; se o cliente precisa escolher o pão, adicionais ou molho deste produto.</p> : <div className="mt-4 space-y-4">{grupos.map((grupo, grupoIndice) => <div key={grupo.id ?? grupoIndice} className="rounded-xl border border-cream-200 bg-cream-50/60 p-3"><div className="flex gap-2"><input value={grupo.nome} onChange={(evento) => alterarGrupo(grupoIndice, { nome: evento.target.value })} placeholder="Pergunta para o cliente (ex.: Escolha seu pão)" className="of-field !min-h-10 flex-1" /><button type="button" onClick={() => setGrupos((atuais) => atuais.filter((_, i) => i !== grupoIndice))} className="of-icon-btn text-danger-600" aria-label="Remover pergunta"><Trash2 size={15} /></button></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[11px] font-semibold text-ink-500">O cliente precisa responder?<select value={grupo.minimoSelecoes > 0 ? "sim" : "nao"} onChange={(evento) => alterarGrupo(grupoIndice, { minimoSelecoes: evento.target.value === "sim" ? 1 : 0 })} className="of-field mt-1 !min-h-9"><option value="nao">Não, pode pular</option><option value="sim">Sim, é obrigatório</option></select></label><label className="text-[11px] font-semibold text-ink-500">Quantas ele pode escolher?<span className="block font-normal text-ink-400">1 = só uma resposta</span><input type="number" min="1" value={grupo.maximoSelecoes} onChange={(evento) => alterarGrupo(grupoIndice, { maximoSelecoes: Number(evento.target.value) })} className="of-field mt-1 !min-h-9" /></label></div><div className="mt-3 space-y-2">{grupo.opcoes.map((opcao, opcaoIndice) => <div key={opcao.id ?? opcaoIndice} className="flex gap-2"><input value={opcao.nome} onChange={(evento) => alterarOpcao(grupoIndice, opcaoIndice, { nome: evento.target.value })} placeholder="Resposta possível (ex.: Brioche)" className="of-field !min-h-9 flex-1" /><label className="relative w-28"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">R$</span><input type="number" min="0" step="0.01" value={opcao.acrescimo} onChange={(evento) => alterarOpcao(grupoIndice, opcaoIndice, { acrescimo: Number(evento.target.value) })} className="of-field !min-h-9 !pl-9" aria-label="Valor extra da opção" /></label><button type="button" onClick={() => alterarGrupo(grupoIndice, { opcoes: grupo.opcoes.filter((_, i) => i !== opcaoIndice) })} className="of-icon-btn shrink-0 text-danger-600" aria-label="Remover opção"><Trash2 size={14} /></button></div>)}</div>{previaGrupo(grupo) && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-[11px] leading-4 text-ink-500"><b className="text-ink-700">Assim o cliente vê no cardápio:</b> {previaGrupo(grupo)}</p>}<button type="button" onClick={() => alterarGrupo(grupoIndice, { opcoes: [...grupo.opcoes, { nome: "", acrescimo: 0, ativo: true }] })} className="mt-3 text-xs font-semibold text-coral-600"><Plus className="mr-1 inline" size={13} />Adicionar outra resposta</button>{REGEX_GRUPO_PAO.test(grupo.nome) && <div className="mt-3 flex flex-wrap gap-1.5"><span className="w-full text-[10px] font-semibold uppercase tracking-wide text-ink-400">Sugestões de pão, toque para adicionar</span>{SUGESTOES_PAO.map((sugestao) => <button key={sugestao} type="button" onClick={() => adicionarSugestao(grupoIndice, sugestao)} className="rounded-full border border-cream-300 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-600 transition hover:border-coral-300 hover:text-coral-600">{sugestao}</button>)}</div>}</div>)}</div>}
    {(erro || salvo) && <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${erro ? "bg-danger-050 text-danger-700" : "bg-basil-050 text-basil-700"}`}>{erro || salvo}</p>}
    <button type="button" onClick={() => void salvar()} disabled={carregando || salvando} className="of-btn-primary mt-4 w-full">{salvando ? <><Loader2 className="animate-spin" size={15} />Salvando...</> : <><Save size={15} />Salvar perguntas</>}</button>
  </section>;
}
