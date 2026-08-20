"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Printer, Radio, TriangleAlert, WifiOff } from "lucide-react";
import type qz from "qz-tray";
import type { ImpressaoJob, Pedido } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

type QzApi = typeof qz;

const PRINTER_STORAGE_KEY = "ohfome.qz.cozinha.printer";
const AUTO_STORAGE_KEY = "ohfome.qz.cozinha.auto";
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

function centralizar(texto: string) {
  const limpo = textoTermico(texto).slice(0, LARGURA_TICKET);
  const espacos = Math.max(0, Math.floor((LARGURA_TICKET - limpo.length) / 2));
  return `${" ".repeat(espacos)}${limpo}`;
}

function localDoPedido(pedido: Pedido) {
  if (pedido.mesaNumero) return `MESA ${pedido.mesaNumero}`;
  if (pedido.formaRecebimento === "entrega") return "DELIVERY";
  if (pedido.formaRecebimento === "retirada") return "RETIRADA";
  return pedido.tipo === "delivery" ? "DELIVERY" : "BALCAO";
}

export function dadosEscPosPedido(pedido: Pedido) {
  const linhas = ["\x1B\x40", "\x1B\x61\x01", "\x1B\x45\x01", `${centralizar("COZINHA")}\n`, `${centralizar(`PEDIDO #${pedido.codigo}`)}\n`, "\x1B\x45\x00", `${centralizar(localDoPedido(pedido))}\n\n`, "\x1B\x61\x00", `${"-".repeat(LARGURA_TICKET)}\n`];

  for (const item of pedido.itens) {
    linhas.push(...quebrarLinha(`${item.quantidade}X ${item.produtoNome}`).map((linha) => `${linha}\n`));
    if (item.observacoes) linhas.push(...quebrarLinha(`  OBS: ${item.observacoes}`).map((linha) => `${linha}\n`));
  }

  if (pedido.observacoes) {
    linhas.push(`${"-".repeat(LARGURA_TICKET)}\n`, ...quebrarLinha(`OBS: ${pedido.observacoes}`).map((linha) => `${linha}\n`));
  }

  linhas.push(`${"-".repeat(LARGURA_TICKET)}\n`, ...quebrarLinha(`ORIGEM: ${pedido.origem === "app" ? "CARDAPIO DIGITAL" : pedido.usuarioNome || "ATENDIMENTO"}`).map((linha) => `${linha}\n`));
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

export function ImpressaoQzTray() {
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
  const [mensagem, setMensagem] = useState("Conecte o QZ Tray nesta estação para imprimir.");

  useEffect(() => {
    const sincronizarPreferencias = window.setTimeout(() => {
      const impressoraSalva = window.localStorage.getItem(PRINTER_STORAGE_KEY) ?? "";
      setImpressora(impressoraSalva);
      setAutomatico(window.localStorage.getItem(AUTO_STORAGE_KEY) === "true");
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
      setMensagem(lista.length ? "QZ Tray conectado. Escolha a impressora da cozinha." : "QZ Tray conectado, mas nenhuma impressora foi encontrada.");
    } catch (erro) {
      setConectado(false);
      setMensagem((erro as Error).message || "Não foi possível conectar ao QZ Tray.");
    } finally {
      setOcupado(false);
    }
  }, [configurarSeguranca]);

  const imprimir = useCallback(async (pedido: Pedido, qzApi = qzRef.current) => {
    if (!qzApi || !impressora) throw new Error("Selecione uma impressora da cozinha.");
    const config = qzApi.configs.create(impressora, { forceRaw: true });
    await qzApi.print(config, dadosEscPosPedido(pedido));
  }, [impressora]);

  const testar = useCallback(async () => {
    setOcupado(true);
    try {
      await imprimir({
        id: "teste", codigo: 0, tipo: "balcao", origem: "presencial", status: "novo", total: 0,
        usuarioNome: "Estacao cozinha", itens: [{ id: "teste", produtoId: "teste", produtoNome: "QZ TRAY CONECTADO", quantidade: 1, precoUnitario: 0, status: "pendente" }],
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

        await imprimir(job.pedido);
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

  function alternarAutomatico() {
    const proximo = !automatico;
    setAutomatico(proximo);
    window.localStorage.setItem(AUTO_STORAGE_KEY, String(proximo));
  }

  const IconeStatus = conectado ? (modoAssinado ? CheckCircle2 : Radio) : WifiOff;
  return <section className="of-panel mb-5 overflow-hidden">
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${conectado ? "bg-emerald-500/10 text-emerald-700" : "bg-cream-100 text-ink-500"}`}><IconeStatus size={18} /></span><div><p className="text-sm font-semibold text-ink-900">Impressora da cozinha</p><p className="mt-0.5 text-xs leading-5 text-ink-500">{mensagem}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><button onClick={() => void conectar()} disabled={ocupado} className="of-btn-secondary min-h-10 px-3">{ocupado ? <LoaderCircle size={15} className="animate-spin" /> : <Radio size={15} />}{conectado ? "Atualizar" : "Conectar QZ"}</button><button onClick={alternarAutomatico} disabled={!conectado || !impressora} className={automatico ? "of-btn-primary min-h-10 px-3" : "of-btn-secondary min-h-10 px-3"}>{automatico ? "Impressão automática ativa" : "Ativar impressão automática"}</button></div>
    </div>
    {conectado && <div className="grid gap-3 border-t border-cream-200 bg-cream-50/55 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-ink-500">Impressora desta estação</span><select value={impressora} onChange={(evento) => selecionarImpressora(evento.target.value)} className="of-field"><option value="">Selecione a impressora</option>{impressoras.map((nome) => <option key={nome} value={nome}>{nome}</option>)}</select></label><button onClick={() => void testar()} disabled={ocupado || !impressora} className="of-btn-secondary min-h-10 px-3"><Printer size={15} /> Imprimir teste</button></div>}
    {conectado && !modoAssinado && <p className="flex gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><TriangleAlert size={16} className="mt-0.5 shrink-0" />Modo de teste: o QZ pode pedir autorização. Para não exibir avisos na operação, configure o certificado e a chave de assinatura do QZ no servidor.</p>}
  </section>;
}
