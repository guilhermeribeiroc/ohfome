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
const LARGURA_TICKET = 32;

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

export function dadosEscPosPedido(pedido: Pedido, largura = LARGURA_TICKET) {
  const cabecalho = cabecalhoTermico(pedido, largura);
  const contexto = `PEDIDO #${pedido.codigo}`;
  const linhas = ["\x1B\x40", "\x1B\x61\x01", "\x1B\x45\x01", `${centralizar(cabecalho, largura)}\n`, `${centralizar(contexto, largura)}\n`, "\x1B\x45\x00", "\n", "\x1B\x61\x00", `${"-".repeat(largura)}\n`];

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

interface ImpressaoQzTrayProps {
  compacta?: boolean;
}

export function ImpressaoQzTray({ compacta = false }: ImpressaoQzTrayProps) {
  const { dados: jobs, recarregar } = usePolling<ImpressaoJob[]>("/api/impressao/jobs", 2000);
  const qzRef = useRef<QzApi | null>(null);
  const processandoRef = useRef(false);
  const segurancaConfiguradaRef = useRef(false);
  const [impressoras, setImpressoras] = useState<string[]>([]);
  const [impressora, setImpressora] = useState("");
  const [conectado, setConectado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [automatico, setAutomatico] = useState(false);
  const [modoAssinado, setModoAssinado] = useState(false);
  const [largura, setLargura] = useState(32);
  const [copias, setCopias] = useState(1);
  const [tentativaReconexao, setTentativaReconexao] = useState(0);
  const [painelAberto, setPainelAberto] = useState(!compacta);
  const [mensagem, setMensagem] = useState("Conecte o QZ Tray nesta estação para imprimir.");

  useEffect(() => {
    const sincronizarPreferencias = window.setTimeout(() => {
      const impressoraSalva = window.localStorage.getItem(PRINTER_STORAGE_KEY) ?? "";
      setImpressora(impressoraSalva);
      setAutomatico(window.localStorage.getItem(AUTO_STORAGE_KEY) === "true");
      setLargura(Number(window.localStorage.getItem(WIDTH_STORAGE_KEY)) === 48 ? 48 : 32);
      setCopias(Math.min(3, Math.max(1, Number(window.localStorage.getItem(COPIES_STORAGE_KEY)) || 1)));
    }, 0);
    return () => window.clearTimeout(sincronizarPreferencias);
  }, []);

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
      setTentativaReconexao(0);
      setMensagem(lista.length ? "QZ Tray conectado à estação do balcão." : "QZ Tray conectado, mas nenhuma impressora foi encontrada.");
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
        usuarioNome: "Estacao do balcao", itens: [{ id: "teste", produtoId: "teste", produtoNome: "QZ TRAY CONECTADO", quantidade: 1, precoUnitario: 0, status: "pendente" }],
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
    if (!automatico || !impressora || conectado || ocupado) return;
    const espera = Math.min(30_000, 1_500 * 2 ** Math.min(tentativaReconexao, 5));
    const id = window.setTimeout(() => void conectar(), espera);
    return () => window.clearTimeout(id);
  }, [automatico, conectado, impressora, ocupado, tentativaReconexao, conectar]);

  useEffect(() => {
    if (!conectado) return;
    const verificar = window.setInterval(() => {
      if (!qzRef.current?.websocket.isActive()) {
        setConectado(false);
        setMensagem("Conexão com o QZ Tray perdida. Reconectando...");
        setTentativaReconexao((atual) => atual + 1);
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
    if (!automatico || !conectado || !impressora || !jobs?.length || processandoRef.current) return;
    const job = jobs[0];
    processandoRef.current = true;

    void (async () => {
      try {
        const reserva = await fetch(`/api/impressao/jobs/${job.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "reservar" }),
        });
        if (reserva.status === 409) return;
        if (!reserva.ok) throw new Error("Não foi possível reservar o ticket.");

        if (!lerRecibos()[job.id]) {
          await imprimir(job.pedido);
          salvarRecibo(job.id);
        }
        await respostaOk(`/api/impressao/jobs/${job.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "concluir" }),
        });
        setMensagem(`Pedido #${job.pedido.codigo} impresso.`);
      } catch (erro) {
        const mensagemErro = (erro as Error).message || "Falha na impressora.";
        await fetch(`/api/impressao/jobs/${job.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "falhar", erro: mensagemErro }),
        }).catch(() => undefined);
        setMensagem(`Falha ao imprimir: ${mensagemErro}`);
      } finally {
        processandoRef.current = false;
        void recarregar();
      }
    })();
  }, [automatico, conectado, impressora, imprimir, jobs, recarregar]);

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

  const IconeStatus = conectado ? (modoAssinado ? CheckCircle2 : Radio) : WifiOff;
  const painel = <section className="of-panel overflow-hidden">
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${conectado ? "bg-emerald-500/10 text-emerald-700" : "bg-cream-100 text-ink-500"}`}><IconeStatus size={18} /></span><div><p className="text-sm font-semibold text-ink-900">Estação de impressão</p><p className="mt-0.5 text-xs leading-5 text-ink-500">{mensagem}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><button onClick={() => void conectar()} disabled={ocupado} className="of-btn-secondary min-h-10 px-3">{ocupado ? <LoaderCircle size={15} className="animate-spin" /> : <Radio size={15} />}{conectado ? "Atualizar" : "Conectar QZ"}</button><button onClick={alternarAutomatico} disabled={!conectado || !impressora} className={automatico ? "of-btn-primary min-h-10 px-3" : "of-btn-secondary min-h-10 px-3"}>{automatico ? "Impressão automática ativa" : "Ativar impressão automática"}</button></div>
    </div>
    {conectado && <div className="grid gap-3 border-t border-cream-200 bg-cream-50/55 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><div className="grid gap-3 sm:grid-cols-3"><label className="block sm:col-span-3"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Impressora desta estação</span><select value={impressora} onChange={(evento) => selecionarImpressora(evento.target.value)} className="of-field"><option value="">Selecione a impressora</option>{impressoras.map((nome) => <option key={nome} value={nome}>{nome}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Largura</span><select value={largura} onChange={(evento) => selecionarLargura(Number(evento.target.value))} className="of-field"><option value={32}>58 mm</option><option value={48}>80 mm</option></select></label><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Cópias</span><select value={copias} onChange={(evento) => selecionarCopias(Number(evento.target.value))} className="of-field"><option value={1}>1 via</option><option value={2}>2 vias</option><option value={3}>3 vias</option></select></label></div><button onClick={() => void testar()} disabled={ocupado || !impressora} className="of-btn-secondary min-h-10 px-3"><Printer size={15} /> Imprimir teste</button></div>}
    {conectado && !modoAssinado && <p className="flex gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><TriangleAlert size={16} className="mt-0.5 shrink-0" />Modo de teste: o QZ pode pedir autorização. Para não exibir avisos na operação, configure o certificado e a chave de assinatura do QZ no servidor.</p>}
  </section>;

  if (!compacta) return painel;
  return <>
    <button onClick={() => setPainelAberto((atual) => !atual)} className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-xs font-semibold shadow-xl transition ${conectado ? "bg-ink-900 text-white" : "bg-coral-600 text-white"}`} title="Abrir estação de impressão"><IconeStatus size={16} />{conectado ? "Impressora conectada" : "Impressora desconectada"}<ChevronDown size={15} className={painelAberto ? "rotate-180 transition-transform" : "transition-transform"} /></button>
    {painelAberto && <div className="fixed inset-x-3 bottom-20 z-40 mx-auto w-auto max-w-2xl sm:inset-x-6">{painel}<button onClick={() => setPainelAberto(false)} className="of-icon-btn absolute right-3 top-3 !h-8 !min-h-8 !w-8" aria-label="Fechar configuração da impressão"><X size={15} /></button><a href="/configuracoes/impressao" className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 text-xs font-semibold text-coral-600 hover:text-coral-700"><Settings2 size={14} /> Configuração guiada</a></div>}
  </>;
}
