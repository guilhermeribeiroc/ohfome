"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, LoaderCircle, Printer, Radio, Settings2, TriangleAlert, WifiOff, X } from "lucide-react";
import type qz from "qz-tray";
import type { ImpressaoJob, Pedido } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

type QzApi = typeof qz;

const PRINTER_STORAGE_KEY = "ohfome.qz.estacao.printer";
const AUTO_STORAGE_KEY = "ohfome.qz.estacao.auto";
const WIDTH_STORAGE_KEY = "ohfome.qz.estacao.width";
const COPIES_STORAGE_KEY = "ohfome.qz.estacao.copies";
const RECEIPTS_STORAGE_KEY = "ohfome.qz.estacao.receipts";
const STATION_STORAGE_KEY = "ohfome.qz.estacao.id";
const LEADER_STORAGE_PREFIX = "ohfome.qz.estacao.lider";
const LARGURA_TICKET = 32;

type LiderDaEstacao = { abaId: string; expiraEm: number };

function textoTermico(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function quebrarLinha(texto: string, largura = LARGURA_TICKET) {
  const palavras = textoTermico(texto).split(" ").filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    if (palavra.length > largura) {
      if (atual) linhas.push(atual);
      linhas.push(palavra.slice(0, largura));
      atual = "";
    } else if (!atual || atual.length + palavra.length + 1 <= largura) {
      atual = atual ? `${atual} ${palavra}` : palavra;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

function centralizar(texto: string, largura = LARGURA_TICKET) {
  const limpo = textoTermico(texto).slice(0, largura);
  const espacos = Math.max(0, Math.floor((largura - limpo.length) / 2));
  return `${" ".repeat(espacos)}${limpo}`;
}

function moedaTermica(valor: number) {
  return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`;
}

function linhaComValor(descricao: string, valor: string, largura = LARGURA_TICKET) {
  const larguraDescricao = Math.max(1, largura - valor.length - 1);
  const linhas = quebrarLinha(descricao, larguraDescricao);
  const ultima = linhas.pop() ?? "";
  return [...linhas.map((linha) => `${linha}\n`), `${ultima}${" ".repeat(Math.max(1, largura - ultima.length - valor.length))}${valor}\n`];
}

function descricaoPagamento(pedido: Pedido) {
  if (pedido.formaPagamento === "cartao") return `CARTAO - ${pedido.tipoCartao === "credito" ? "CREDITO" : "DEBITO"}`;
  if (pedido.formaPagamento === "dinheiro") return pedido.trocoPara ? `DINHEIRO | TROCO P/ ${moedaTermica(pedido.trocoPara)}` : "DINHEIRO | SEM TROCO";
  if (pedido.formaPagamento === "pix") return "PIX";
  return "A COMBINAR";
}

function cabecalhoTermico(pedido: Pedido, largura: number) {
  if (!pedido.estabelecimentoNome) return "OHFOME";
  const sufixo = " - OHFOME";
  const limiteNome = Math.max(1, largura - sufixo.length);
  return `${textoTermico(pedido.estabelecimentoNome).slice(0, limiteNome)}${sufixo}`;
}

function modalidadePedido(pedido: Pedido) {
  if (pedido.mesaNumero) return `MESA ${pedido.mesaNumero}`;
  if (pedido.formaRecebimento === "entrega" || pedido.tipo === "delivery") return "DELIVERY";
  if (pedido.formaRecebimento === "retirada") return "RETIRADA";
  return "CONTROLE DE PEDIDOS";
}

function exibeClienteNaComanda(pedido: Pedido) {
  return pedido.formaRecebimento === "entrega" || pedido.formaRecebimento === "retirada" || pedido.tipo === "delivery";
}

export function dadosEscPosPedido(pedido: Pedido, largura = LARGURA_TICKET) {
  const cabecalho = cabecalhoTermico(pedido, largura);
  const contexto = `PEDIDO #${pedido.codigo} - ${modalidadePedido(pedido)}`.slice(0, largura);
  const linhas = ["\x1B\x40", "\x1B\x61\x01", "\x1B\x45\x01", `${centralizar(cabecalho, largura)}\n`, `${centralizar(contexto, largura)}\n`, "\x1B\x45\x00", "\n", "\x1B\x61\x00", `${"-".repeat(largura)}\n`];

  if (exibeClienteNaComanda(pedido) && pedido.clienteNome?.trim()) {
    linhas.push(...quebrarLinha(`CLIENTE: ${pedido.clienteNome.trim()}`, largura).map((linha) => `${linha}\n`), "\n");
  }

  for (const item of pedido.itens) {
    linhas.push(...linhaComValor(`${item.quantidade}X ${item.produtoNome}`, moedaTermica(item.precoUnitario * item.quantidade), largura));
    if (item.observacoes) linhas.push(...quebrarLinha(`  OBS: ${item.observacoes}`, largura).map((linha) => `${linha}\n`));
  }

  if (pedido.formaRecebimento === "entrega") {
    linhas.push(`${"-".repeat(largura)}\n`, ...linhaComValor("TAXA DE ENTREGA", Number(pedido.taxaEntrega) > 0 ? moedaTermica(Number(pedido.taxaEntrega)) : "GRATIS", largura));
  }

  linhas.push(`${"-".repeat(largura)}\n`, ...linhaComValor("TOTAL", moedaTermica(pedido.total), largura));

  if (pedido.enderecoEntrega) {
    linhas.push(`${"-".repeat(largura)}\n`, ...quebrarLinha("ENDERECO:", largura).map((linha) => `${linha}\n`), ...quebrarLinha(pedido.enderecoEntrega, largura).map((linha) => `${linha}\n`));
  }

  linhas.push(...quebrarLinha(`PAGAMENTO: ${descricaoPagamento(pedido)}`, largura).map((linha) => `${linha}\n`));

  if (pedido.observacoes) {
    linhas.push(`${"-".repeat(largura)}\n`, ...quebrarLinha(`OBS: ${pedido.observacoes}`, largura).map((linha) => `${linha}\n`));
  }

  linhas.push(`${"-".repeat(largura)}\n`, ...quebrarLinha(`ORIGEM: ${pedido.origem === "app" ? "CARDAPIO DIGITAL" : pedido.usuarioNome || "ATENDIMENTO"}`, largura).map((linha) => `${linha}\n`));
  linhas.push(`${new Date(pedido.createdAt).toLocaleString("pt-BR")}\n`, "\n\n", "\x1D\x56\x00");
  return linhas;
}

async function carregarQz(): Promise<QzApi> {
  const modulo = await import("qz-tray");
  return (modulo.default ?? modulo) as QzApi;
}

async function respostaOk(url: string, init?: RequestInit) {
  const resposta = await fetch(url, init);
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => null);
    throw new Error(dados?.erro ?? "Não foi possível atualizar a fila de impressão.");
  }
  return resposta;
}

function lerRecibos() {
  try {
    const valor = window.localStorage.getItem(RECEIPTS_STORAGE_KEY);
    const recibos = valor ? JSON.parse(valor) as Record<string, number> : {};
    const limite = Date.now() - 86_400_000;
    return Object.fromEntries(Object.entries(recibos).filter(([, criadoEm]) => typeof criadoEm === "number" && criadoEm >= limite));
  } catch {
    return {} as Record<string, number>;
  }
}

function salvarRecibo(jobId: string) {
  const recibos = lerRecibos();
  recibos[jobId] = Date.now();
  window.localStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(recibos));
}

function obterOuCriarEstacao() {
  const existente = window.localStorage.getItem(STATION_STORAGE_KEY);
  if (existente) return existente;
  const criada = window.crypto.randomUUID();
  window.localStorage.setItem(STATION_STORAGE_KEY, criada);
  return criada;
}

function lerLider(chave: string): LiderDaEstacao | null {
  try {
    const valor = window.localStorage.getItem(chave);
    if (!valor) return null;
    const lider = JSON.parse(valor) as LiderDaEstacao;
    return typeof lider?.abaId === "string" && typeof lider?.expiraEm === "number" ? lider : null;
  } catch {
    return null;
  }
}

interface ImpressaoQzTrayProps {
  compacta?: boolean;
}

export function ImpressaoQzTray({ compacta = false }: ImpressaoQzTrayProps) {
  const { dados: jobs, recarregar } = usePolling<ImpressaoJob[]>("/api/impressao/jobs", 2000);
  const { dados: falhos, recarregar: recarregarFalhos } = usePolling<ImpressaoJob[]>("/api/impressao/jobs?status=falhou", 10_000);
  const qzRef = useRef<QzApi | null>(null);
  const processandoRef = useRef(false);
  const segurancaConfiguradaRef = useRef(false);
  const abaIdRef = useRef("");
  const [impressoras, setImpressoras] = useState<string[]>([]);
  const [impressora, setImpressora] = useState("");
  const [conectado, setConectado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [automatico, setAutomatico] = useState(false);
  const [modoAssinado, setModoAssinado] = useState(false);
  const [largura, setLargura] = useState(32);
  const [copias, setCopias] = useState(1);
  const [tentativaReconexao, setTentativaReconexao] = useState(0);
  const [estacaoId, setEstacaoId] = useState("");
  const [estaAbaLider, setEstaAbaLider] = useState(false);
  const [ultimoPedidoImpresso, setUltimoPedidoImpresso] = useState<number | null>(null);
  const [ultimoContato, setUltimoContato] = useState<number | null>(null);
  const [painelAberto, setPainelAberto] = useState(!compacta);
  const [mensagem, setMensagem] = useState("Conecte o QZ Tray nesta estação para imprimir.");

  useEffect(() => {
    const sincronizarPreferencias = window.setTimeout(() => {
      const impressoraSalva = window.localStorage.getItem(PRINTER_STORAGE_KEY) ?? "";
      setImpressora(impressoraSalva);
      setAutomatico(window.localStorage.getItem(AUTO_STORAGE_KEY) === "true");
      setLargura(Number(window.localStorage.getItem(WIDTH_STORAGE_KEY)) === 48 ? 48 : 32);
      setCopias(Math.min(3, Math.max(1, Number(window.localStorage.getItem(COPIES_STORAGE_KEY)) || 1)));
      abaIdRef.current = window.crypto.randomUUID();
      setEstacaoId(obterOuCriarEstacao());
    }, 0);
    return () => window.clearTimeout(sincronizarPreferencias);
  }, []);

  useEffect(() => {
    if (!estacaoId || !abaIdRef.current) return;
    const chave = `${LEADER_STORAGE_PREFIX}.${estacaoId}`;
    const renovar = () => {
      const agora = Date.now();
      const atual = lerLider(chave);
      if (!atual || atual.expiraEm <= agora || atual.abaId === abaIdRef.current) {
        window.localStorage.setItem(chave, JSON.stringify({ abaId: abaIdRef.current, expiraEm: agora + 10_000 } satisfies LiderDaEstacao));
      }
      setEstaAbaLider(lerLider(chave)?.abaId === abaIdRef.current);
    };
    const aoMudarLider = (evento: StorageEvent) => {
      if (evento.key === chave) setEstaAbaLider(lerLider(chave)?.abaId === abaIdRef.current);
    };
    renovar();
    const intervalo = window.setInterval(renovar, 3_000);
    window.addEventListener("storage", aoMudarLider);
    window.addEventListener("focus", renovar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("storage", aoMudarLider);
      window.removeEventListener("focus", renovar);
      if (lerLider(chave)?.abaId === abaIdRef.current) window.localStorage.removeItem(chave);
    };
  }, [estacaoId]);

  const configurarSeguranca = useCallback(async (qzApi: QzApi) => {
    if (segurancaConfiguradaRef.current) return;
    segurancaConfiguradaRef.current = true;
    const certificado = await fetch("/api/impressao/qz-certificado", { cache: "no-store" });
    if (certificado.status === 204) {
      setModoAssinado(false);
      return;
    }
    if (!certificado.ok) throw new Error("Não foi possível carregar o certificado do QZ Tray.");

    const conteudoCertificado = await certificado.text();
    qzApi.security.setCertificatePromise((resolve) => resolve(conteudoCertificado));
    qzApi.security.setSignatureAlgorithm("SHA512");
    qzApi.security.setSignaturePromise((payload) => (resolve, reject) => {
      void fetch("/api/impressao/qz-assinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      })
        .then(async (resposta) => {
          if (!resposta.ok) throw new Error("A assinatura do QZ Tray falhou.");
          resolve(await resposta.text());
        })
        .catch(reject);
    });
    setModoAssinado(true);
  }, []);

  const conectar = useCallback(async () => {
    setOcupado(true);
    try {
      const qzApi = await carregarQz();
      await configurarSeguranca(qzApi);
      if (!qzApi.websocket.isActive()) await qzApi.websocket.connect();
      qzRef.current = qzApi;
      const encontradas = await qzApi.printers.find();
      const lista = (Array.isArray(encontradas) ? encontradas : [encontradas]).sort((a, b) => a.localeCompare(b));
      setImpressoras(lista);
      setConectado(true);
      setUltimoContato(Date.now());
      setTentativaReconexao(0);
      setMensagem(lista.length ? "QZ Tray conectado à estação de impressão." : "QZ Tray conectado, mas nenhuma impressora foi encontrada.");
    } catch (erro) {
      setConectado(false);
      setMensagem((erro as Error).message || "Não foi possível conectar ao QZ Tray.");
      setTentativaReconexao((atual) => atual + 1);
    } finally {
      setOcupado(false);
    }
  }, [configurarSeguranca]);

  const imprimir = useCallback(async (pedido: Pedido, qzApi = qzRef.current) => {
    if (!qzApi || !impressora) throw new Error("Selecione uma impressora da cozinha.");
    const config = qzApi.configs.create(impressora, { forceRaw: true });
    const dados = dadosEscPosPedido(pedido, largura);
    for (let indice = 0; indice < copias; indice += 1) await qzApi.print(config, dados);
  }, [copias, impressora, largura]);

  const testar = useCallback(async () => {
    setOcupado(true);
    try {
      await imprimir({
        id: "teste", codigo: 0, tipo: "balcao", origem: "presencial", status: "novo", total: 0,
        usuarioNome: "Estação de impressão", itens: [{ id: "teste", produtoId: "teste", produtoNome: "QZ TRAY CONECTADO", quantidade: 1, precoUnitario: 0, status: "pendente" }],
        createdAt: new Date().toISOString(),
      });
      setMensagem("Teste enviado para a impressora.");
    } catch (erro) {
      setMensagem((erro as Error).message || "Não foi possível imprimir o teste.");
    } finally {
      setOcupado(false);
    }
  }, [imprimir]);

  useEffect(() => {
    if (!estaAbaLider || !automatico || !impressora || conectado || ocupado) return;
    const espera = Math.min(30_000, 1_500 * 2 ** Math.min(tentativaReconexao, 5));
    const id = window.setTimeout(() => void conectar(), espera);
    return () => window.clearTimeout(id);
  }, [estaAbaLider, automatico, conectado, impressora, ocupado, tentativaReconexao, conectar]);

  useEffect(() => {
    if (!conectado) return;
    const verificar = window.setInterval(() => {
      if (!qzRef.current?.websocket.isActive()) {
        setConectado(false);
        setMensagem("Conexão com o QZ Tray perdida. Reconectando...");
        setTentativaReconexao((atual) => atual + 1);
      } else {
        setUltimoContato(Date.now());
      }
    }, 5_000);
    return () => window.clearInterval(verificar);
  }, [conectado]);

  useEffect(() => {
    const acelerar = () => setTentativaReconexao((atual) => atual + 1);
    window.addEventListener("online", acelerar);
    window.addEventListener("focus", acelerar);
    return () => {
      window.removeEventListener("online", acelerar);
      window.removeEventListener("focus", acelerar);
    };
  }, []);

  useEffect(() => {
    const abrir = () => setPainelAberto(true);
    window.addEventListener("ohfome:abrir-configuracao-impressao", abrir);
    return () => window.removeEventListener("ohfome:abrir-configuracao-impressao", abrir);
  }, []);

  useEffect(() => {
    if (!estaAbaLider || !estacaoId || !automatico || !conectado || !impressora || !jobs?.length || processandoRef.current) return;
    const job = jobs[0];
    processandoRef.current = true;

    void (async () => {
      let tokenReserva = "";
      let heartbeat: number | undefined;
      try {
        const reserva = await fetch(`/api/impressao/jobs/${job.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "reservar", estacaoId }),
        });
        if (reserva.status === 409) return;
        if (!reserva.ok) throw new Error("Não foi possível reservar o ticket.");
        const dadosReserva = await reserva.json() as { tokenReserva?: string };
        tokenReserva = dadosReserva.tokenReserva ?? "";
        if (!tokenReserva) throw new Error("A reserva da estação não foi confirmada.");
        heartbeat = window.setInterval(() => {
          void fetch(`/api/impressao/jobs/${job.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "heartbeat", estacaoId, tokenReserva }),
          });
        }, 30_000);

        if (!lerRecibos()[job.id]) {
          await imprimir(job.pedido);
          salvarRecibo(job.id);
        }
        await respostaOk(`/api/impressao/jobs/${job.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "concluir", estacaoId, tokenReserva }),
        });
        setUltimoPedidoImpresso(job.pedido.codigo);
        setMensagem(`Pedido #${job.pedido.codigo} impresso.`);
      } catch (erro) {
        const mensagemErro = (erro as Error).message || "Falha na impressora.";
        if (tokenReserva) {
          await fetch(`/api/impressao/jobs/${job.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "falhar", estacaoId, tokenReserva, erro: mensagemErro }),
          }).catch(() => undefined);
        }
        setMensagem(`Falha ao imprimir: ${mensagemErro}`);
      } finally {
        if (heartbeat) window.clearInterval(heartbeat);
        processandoRef.current = false;
        void recarregar();
      }
    })();
  }, [estaAbaLider, estacaoId, automatico, conectado, impressora, imprimir, jobs, recarregar]);

  function selecionarImpressora(valor: string) {
    setImpressora(valor);
    window.localStorage.setItem(PRINTER_STORAGE_KEY, valor);
  }

  function selecionarLargura(valor: number) {
    setLargura(valor);
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(valor));
  }

  function selecionarCopias(valor: number) {
    setCopias(valor);
    window.localStorage.setItem(COPIES_STORAGE_KEY, String(valor));
  }

  function alternarAutomatico() {
    const proximo = !automatico;
    setAutomatico(proximo);
    window.localStorage.setItem(AUTO_STORAGE_KEY, String(proximo));
  }

  async function reenviar(job: ImpressaoJob) {
    setOcupado(true);
    try {
      await respostaOk("/api/impressao/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pedidoId: job.pedidoId }) });
      setMensagem(`Pedido #${job.pedido.codigo} reenviado para a fila.`);
      void recarregar();
      void recarregarFalhos();
    } catch (erro) {
      setMensagem((erro as Error).message || "Não foi possível reenviar o ticket.");
    } finally {
      setOcupado(false);
    }
  }

  const IconeStatus = conectado ? (modoAssinado ? CheckCircle2 : Radio) : WifiOff;
  const pendentes = jobs?.length ?? 0;
  const painel = <section className="of-panel overflow-hidden">
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${conectado ? "bg-emerald-500/10 text-emerald-700" : "bg-cream-100 text-ink-500"}`}><IconeStatus size={18} /></span><div><p className="text-sm font-semibold text-ink-900">Estação de impressão</p><p className="mt-0.5 text-xs leading-5 text-ink-500">{mensagem}</p><p className="mt-1 text-[10px] font-medium uppercase tracking-[.1em] text-ink-400">{estaAbaLider ? "Esta aba coordena a fila" : "Outra aba coordena a fila"}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><button onClick={() => void conectar()} disabled={ocupado} className="of-btn-secondary min-h-10 px-3">{ocupado ? <LoaderCircle size={15} className="animate-spin" /> : <Radio size={15} />}{conectado ? "Atualizar" : "Conectar QZ"}</button><button onClick={alternarAutomatico} disabled={!conectado || !impressora} className={automatico ? "of-btn-primary min-h-10 px-3" : "of-btn-secondary min-h-10 px-3"}>{automatico ? "Impressão automática ativa" : "Ativar impressão automática"}</button></div>
    </div>
    {conectado && <div className="grid gap-3 border-t border-cream-200 bg-cream-50/55 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><div className="grid gap-3 sm:grid-cols-3"><label className="block sm:col-span-3"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Impressora desta estação</span><select value={impressora} onChange={(evento) => selecionarImpressora(evento.target.value)} className="of-field"><option value="">Selecione a impressora</option>{impressoras.map((nome) => <option key={nome} value={nome}>{nome}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Largura</span><select value={largura} onChange={(evento) => selecionarLargura(Number(evento.target.value))} className="of-field"><option value={32}>58 mm</option><option value={48}>80 mm</option></select></label><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Cópias</span><select value={copias} onChange={(evento) => selecionarCopias(Number(evento.target.value))} className="of-field"><option value={1}>1 via</option><option value={2}>2 vias</option><option value={3}>3 vias</option></select></label><div className="rounded-xl border border-cream-200 bg-white px-3 py-2.5"><span className="block text-[10px] font-semibold uppercase tracking-[.1em] text-ink-400">Fila pendente</span><strong className="mt-0.5 block text-sm text-ink-900">{pendentes} {pendentes === 1 ? "pedido" : "pedidos"}</strong></div></div><button onClick={() => void testar()} disabled={ocupado || !impressora} className="of-btn-secondary min-h-10 px-3"><Printer size={15} /> Imprimir teste</button></div>}
    {conectado && !modoAssinado && <p className="flex gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><TriangleAlert size={16} className="mt-0.5 shrink-0" />Modo de teste: o QZ pode pedir autorização. Para não exibir avisos na operação, configure o certificado e a chave de assinatura do QZ no servidor.</p>}
    {!!falhos?.length && <div className="border-t border-danger-400/20 bg-danger-050/60 p-4"><p className="text-xs font-semibold text-danger-600">Tickets que precisam de atenção</p><div className="mt-2 space-y-2">{falhos.slice(0, 3).map((job) => <div key={job.id} className="flex items-center justify-between gap-3 rounded-xl border border-danger-400/15 bg-white px-3 py-2"><span className="min-w-0 text-xs text-ink-600">Pedido #{job.pedido.codigo}<small className="ml-2 text-ink-400">{job.erro || "Falha após tentativas"}</small></span><button onClick={() => void reenviar(job)} disabled={ocupado} className="shrink-0 text-xs font-semibold text-danger-600 hover:text-danger-700">Reenviar</button></div>)}</div></div>}
  </section>;

  if (!compacta) return painel;
  return <>
    <button onClick={() => setPainelAberto((atual) => !atual)} className={`fixed right-3 top-3 z-40 flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-semibold shadow-xl transition sm:right-5 sm:top-5 ${conectado ? "bg-ink-900 text-white" : "bg-coral-600 text-white"}`} title="Abrir estação de impressão"><IconeStatus size={16} />{conectado ? "Impressora conectada" : "Impressora desconectada"}{pendentes > 0 && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{pendentes}</span>}<ChevronDown size={15} className={painelAberto ? "rotate-180 transition-transform" : "transition-transform"} /></button>
    {painelAberto && <div className="fixed inset-x-3 top-16 z-40 mx-auto w-auto max-w-2xl sm:left-auto sm:right-5 sm:top-20 sm:w-[min(42rem,calc(100vw-2.5rem))]">{painel}<div className="flex items-center justify-between border-t border-cream-200 bg-white px-4 py-3"><a href="/configuracoes/impressao" className="inline-flex items-center gap-1.5 text-xs font-semibold text-coral-600 hover:text-coral-700"><Settings2 size={14} /> Configuração guiada</a><span className="text-[10px] text-ink-400">{ultimoPedidoImpresso ? `Último: #${ultimoPedidoImpresso}` : ultimoContato ? "Estação monitorada" : "Aguardando estação"}</span></div><button onClick={() => setPainelAberto(false)} className="of-icon-btn absolute right-3 top-3 !h-8 !min-h-8 !w-8" aria-label="Fechar configuração da impressão"><X size={15} /></button></div>}
  </>;
}
