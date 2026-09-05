"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Lenis from "@studio-freight/lenis";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  CircleHelp,
  Info,
  Menu,
  MessageCircle,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Banknote,
  CreditCard,
  Store,
  Truck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { CategoryIcon, SegmentIcon } from "@/components/ui/AppIcons";
import { OhFomeMark } from "@/components/ui/OhFomeLogo";
import { SEGMENTOS } from "@/lib/tenant-types";
import { mascararMoeda, numeroDaMoeda } from "@/lib/moeda";
import { usePolling } from "@/lib/use-polling";
import { Bell, ChefHat, PackageCheck, PackageSearch } from "lucide-react";

interface ProdutoPublico {
  id: string;
  nome: string;
  tamanho?: "P" | "M" | "G" | null;
  descricao: string | null;
  categoriaNome: string;
  precoVenda: number;
  imagemUrl?: string | null;
}

interface CardapioData {
  id: string;
  nome: string;
  tipo: string;
  tipoComida: string;
  logoUrl?: string | null;
  whatsappAtendimento?: string | null;
  bannerModo?: "padrao" | "fixo" | "carrossel";
  banners?: { id: string; url: string; ordem: number; enquadramento?: "topo" | "centro" | "base" }[];
  pix?: { modo: "manual" | "mercado_pago" } | null;
  disponibilidade?: { aberto: boolean; pausado: boolean; configurado?: boolean; motivo?: string | null; turnos: Record<string, { inicio: string; fim: string }[]> };
  produtos: ProdutoPublico[];
}

type GrupoMenu = "comidas" | "bebidas";
type Overlay =
  | "produto"
  | "carrinho"
  | "pix"
  | "info"
  | "sucesso"
  | "menu"
  | "pedidos"
  | null;

interface PedidoAtivo {
  id: string;
  codigo: number;
}
interface CobrancaPix {
  pedidoId: string;
  codigo: number;
  qrCodeBase64: string;
  copiaCola: string;
  expiraEm: string;
}

interface CarrinhoSalvo {
  itens: Record<string, number>;
  observacoes: Record<string, string>;
}

function chavePedidoAtivo(slug: string) {
  return `ohfome_pedido_ativo_${slug}`;
}

function chaveCarrinho(slug: string) {
  return `ohfome_carrinho_${slug}`;
}

function carregarPedidoAtivo(slug: string): PedidoAtivo | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(chavePedidoAtivo(slug));
    return bruto ? (JSON.parse(bruto) as PedidoAtivo) : null;
  } catch {
    return null;
  }
}

function carregarCarrinho(slug: string): CarrinhoSalvo | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(chaveCarrinho(slug));
    if (!bruto) return null;
    const carrinho = JSON.parse(bruto) as Partial<CarrinhoSalvo>;
    return {
      itens: carrinho.itens ?? {},
      observacoes: carrinho.observacoes ?? {},
    };
  } catch {
    return null;
  }
}

const BEBIDA =
  /bebida|suco|refri|refrigerante|drink|cerveja|vinho|água|agua|café|cafe|chá|cha/i;
const ATLAS_POSITIONS = [
  "0% 0%",
  "50% 0%",
  "100% 0%",
  "0% 100%",
  "50% 100%",
  "100% 100%",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function hashDe(texto: string) {
  let hash = 0;
  for (let index = 0; index < texto.length; index++)
    hash = (hash * 31 + texto.charCodeAt(index)) >>> 0;
  return hash;
}

function fotoDoProduto(produto: ProdutoPublico): CSSProperties {
  if (produto.imagemUrl)
    return {
      backgroundImage: `url(${produto.imagemUrl})`,
      backgroundPosition: "center",
      backgroundSize: "cover",
    };
  return {
    backgroundImage: "url(/menu-assets/ohfome-food-atlas.webp)",
    backgroundPosition:
      ATLAS_POSITIONS[hashDe(produto.nome) % ATLAS_POSITIONS.length],
    backgroundSize: "300% 200%",
  };
}

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function nomeProdutoExibicao(produto: ProdutoPublico) {
  return produto.tamanho ? `${produto.nome} (${produto.tamanho})` : produto.nome;
}

function grupoDaCategoria(nome: string): GrupoMenu {
  return BEBIDA.test(nome) ? "bebidas" : "comidas";
}

function descricaoDoProduto(produto: ProdutoPublico) {
  if (produto.descricao) return produto.descricao;
  const referencia = `${produto.nome} ${produto.categoriaNome}`;
  if (/carne|picanha|costela/i.test(referencia))
    return "Corte selecionado, preparado lentamente para preservar suculência, textura e sabor.";
  if (/espeto/i.test(referencia))
    return "Seleção da casa assada na brasa e finalizada no ponto ideal.";
  if (/acompanhamento|arroz|baião|baiao/i.test(referencia))
    return "Receita da casa preparada no dia com ingredientes selecionados.";
  if (BEBIDA.test(referencia))
    return "Servida na temperatura ideal para acompanhar sua experiência.";
  return "Uma escolha preparada com ingredientes selecionados e o cuidado da nossa cozinha.";
}

export function CardapioPublico({ slug }: { slug: string }) {
  const [dados, setDados] = useState<CardapioData | null>(null);
  const [erroCarregar, setErroCarregar] = useState(false);
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [observacoesItens, setObservacoesItens] = useState<
    Record<string, string>
  >({});
  const [grupo, setGrupo] = useState<GrupoMenu>("comidas");
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);
  const [produtoSelecionado, setProdutoSelecionado] =
    useState<ProdutoPublico | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [codigoPedido, setCodigoPedido] = useState<number | null>(null);
  const [linkWhatsapp, setLinkWhatsapp] = useState<string | null>(null);
  const [pagamentoPixConfirmado, setPagamentoPixConfirmado] = useState(false);
  const [pedidoAtivo, setPedidoAtivo] = useState<PedidoAtivo | null>(null);
  const [cobrancaPix, setCobrancaPix] = useState<CobrancaPix | null>(null);
  const [indiceBanner, setIndiceBanner] = useState(0);
  const [avisoCarrinho, setAvisoCarrinho] = useState<string | null>(null);
  const overlayAtual = useRef<Overlay>(null);
  const historicoDoOverlay = useRef(false);
  const carrinhoHidratado = useRef(false);

  const bannersAtivos = useMemo(
    () => (dados?.banners ?? []).slice().sort((a, b) => a.ordem - b.ordem),
    [dados?.banners],
  );
  const bannerAtual = bannersAtivos[indiceBanner] ?? bannersAtivos[0];

  useEffect(() => {
    const carregar = window.setTimeout(
      () => setPedidoAtivo(carregarPedidoAtivo(slug)),
      0,
    );
    return () => window.clearTimeout(carregar);
  }, [slug]);

  useEffect(() => {
    const restaurar = window.setTimeout(() => {
      const salvo = carregarCarrinho(slug);
      if (salvo) {
        setCarrinho(salvo.itens);
        setObservacoesItens(salvo.observacoes);
      }
      carrinhoHidratado.current = true;
    }, 0);
    return () => window.clearTimeout(restaurar);
  }, [slug]);

  useEffect(() => {
    if (!carrinhoHidratado.current) return;
    try {
      if (Object.keys(carrinho).length) {
        window.localStorage.setItem(
          chaveCarrinho(slug),
          JSON.stringify({ itens: carrinho, observacoes: observacoesItens }),
        );
      } else {
        window.localStorage.removeItem(chaveCarrinho(slug));
      }
    } catch {
      /* carrinho continua funcional mesmo sem armazenamento local */
    }
  }, [carrinho, observacoesItens, slug]);

  useEffect(() => {
    const aoVoltar = () => {
      if (!overlayAtual.current) return;
      overlayAtual.current = null;
      historicoDoOverlay.current = false;
      setOverlay(null);
      setProdutoSelecionado(null);
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  useEffect(() => {
    const resetar = window.setTimeout(() => setIndiceBanner(0), 0);
    return () => window.clearTimeout(resetar);
  }, [dados?.id, bannersAtivos.length]);

  useEffect(() => {
    if (
      dados?.bannerModo !== "carrossel" ||
      bannersAtivos.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const intervalo = window.setInterval(
      () => setIndiceBanner((atual) => (atual + 1) % bannersAtivos.length),
      5_000,
    );
    return () => window.clearInterval(intervalo);
  }, [dados?.bannerModo, bannersAtivos.length]);

  useEffect(() => {
    if (!avisoCarrinho) return;
    const temporizador = window.setTimeout(() => setAvisoCarrinho(null), 4_000);
    return () => window.clearTimeout(temporizador);
  }, [avisoCarrinho]);
  const refsCategoria = useRef<Record<string, HTMLElement | null>>({});
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    fetch(`/api/publico/${slug}`)
      .then(async (resposta) => {
        if (!resposta.ok) {
          setErroCarregar(true);
          return;
        }
        setDados(await resposta.json());
      })
      .catch(() => setErroCarregar(true));
  }, [slug]);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.08,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.05,
    });
    lenisRef.current = lenis;
    let frame = 0;
    const atualizar = (tempo: number) => {
      lenis.raf(tempo);
      frame = requestAnimationFrame(atualizar);
    };
    frame = requestAnimationFrame(atualizar);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!lenisRef.current) return;
    if (overlay) lenisRef.current.stop();
    else lenisRef.current.start();
  }, [overlay]);

  const categorias = useMemo(() => {
    if (!dados) return [];
    const nomes = [
      ...new Set(dados.produtos.map((produto) => produto.categoriaNome)),
    ];
    return nomes.map((nome) => ({
      nome,
      grupo: grupoDaCategoria(nome),
      itens: dados.produtos.filter((produto) => produto.categoriaNome === nome),
    }));
  }, [dados]);

  const gruposDisponiveis = useMemo(
    () => ({
      comidas: categorias.some((categoria) => categoria.grupo === "comidas"),
      bebidas: categorias.some((categoria) => categoria.grupo === "bebidas"),
    }),
    [categorias],
  );

  const grupoAtivo: GrupoMenu = gruposDisponiveis[grupo]
    ? grupo
    : gruposDisponiveis.comidas
      ? "comidas"
      : "bebidas";
  const categoriasVisiveis = useMemo(
    () => categorias.filter((categoria) => categoria.grupo === grupoAtivo),
    [categorias, grupoAtivo],
  );
  const categoriaAtivaExibida =
    categoriaAtiva &&
    categoriasVisiveis.some((categoria) => categoria.nome === categoriaAtiva)
      ? categoriaAtiva
      : (categoriasVisiveis[0]?.nome ?? null);

  useEffect(() => {
    let quadro = 0;

    const sincronizarCategoria = () => {
      quadro = 0;
      // A categoria muda quando o próximo título já entrou na área de leitura,
      // antes de ficar escondido atrás da navegação fixa do celular.
      const referencia = 300;
      const secoes = categorias
        .map((categoria) => ({
          categoria,
          elemento: refsCategoria.current[categoria.nome],
        }))
        .filter(
          (
            item,
          ): item is {
            categoria: (typeof categorias)[number];
            elemento: HTMLElement;
          } => Boolean(item.elemento),
        );

      if (!secoes.length) return;
      const chegouAoFim =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 24;
      const atual = chegouAoFim
        ? secoes.at(-1)!
        : (secoes
            .filter(
              ({ elemento }) =>
                elemento.getBoundingClientRect().top <= referencia,
            )
            .at(-1) ?? secoes[0]);
      setCategoriaAtiva((anterior) =>
        anterior === atual.categoria.nome ? anterior : atual.categoria.nome,
      );
      setGrupo((anterior) =>
        anterior === atual.categoria.grupo ? anterior : atual.categoria.grupo,
      );
    };

    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(sincronizarCategoria);
    };

    sincronizarCategoria();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar);
    return () => {
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [categorias]);

  const produtosEncontrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo || !dados) return [];
    return dados.produtos.filter((produto) =>
      `${produto.nome} ${produto.descricao ?? ""} ${produto.categoriaNome}`
        .toLocaleLowerCase("pt-BR")
        .includes(termo),
    );
  }, [busca, dados]);

  const totalItens = Object.values(carrinho).reduce(
    (total, quantidade) => total + quantidade,
    0,
  );
  const totalValor = useMemo(() => {
    if (!dados) return 0;
    return Object.entries(carrinho).reduce(
      (total, [id, quantidade]) =>
        total +
        (dados.produtos.find((produto) => produto.id === id)?.precoVenda ?? 0) *
          quantidade,
      0,
    );
  }, [carrinho, dados]);

  const segmento = SEGMENTOS.find((item) => item.id === dados?.tipo);
  const cardapioDisponivel = dados?.disponibilidade?.aberto ?? true;

  function ajustar(produtoId: string, delta: number) {
    if (!cardapioDisponivel) return;
    navigator.vibrate?.(10);
    setCarrinho((atual) => {
      const quantidade = (atual[produtoId] ?? 0) + delta;
      if (quantidade <= 0)
        return Object.fromEntries(
          Object.entries(atual).filter(([id]) => id !== produtoId),
        );
      return { ...atual, [produtoId]: quantidade };
    });
  }

  function adicionarEVoltarAoCardapio(produto: ProdutoPublico) {
    if (!cardapioDisponivel) {
      setAvisoCarrinho(
        dados?.disponibilidade?.motivo ?? "O delivery está fechado no momento.",
      );
      return;
    }
    ajustar(produto.id, 1);
    setAvisoCarrinho(`${produto.nome} foi adicionado ao pedido.`);
    fecharOverlay();
  }

  function abrirOverlay(novoOverlay: Exclude<Overlay, null>) {
    if (typeof window !== "undefined") {
      if (!historicoDoOverlay.current) {
        window.history.pushState({ ohfomeOverlay: novoOverlay }, "");
        historicoDoOverlay.current = true;
      } else {
        window.history.replaceState({ ohfomeOverlay: novoOverlay }, "");
      }
    }
    overlayAtual.current = novoOverlay;
    setOverlay(novoOverlay);
  }

  function fecharOverlay() {
    if (typeof window !== "undefined" && historicoDoOverlay.current) {
      window.history.back();
      return;
    }
    overlayAtual.current = null;
    setOverlay(null);
    setProdutoSelecionado(null);
  }

  function limparCarrinho() {
    setCarrinho({});
    setObservacoesItens({});
    try {
      window.localStorage.removeItem(chaveCarrinho(slug));
    } catch {
      /* armazenamento local indisponível */
    }
  }

  function atualizarObservacaoItem(produtoId: string, observacao: string) {
    setObservacoesItens((atual) => ({
      ...atual,
      [produtoId]: observacao.slice(0, 1000),
    }));
  }

  function abrirProduto(produto: ProdutoPublico) {
    setProdutoSelecionado(produto);
    abrirOverlay("produto");
  }

  function irParaCategoria(nome: string) {
    const destino = refsCategoria.current[nome];
    const categoria = categorias.find((item) => item.nome === nome);
    if (categoria) setGrupo(categoria.grupo);
    setCategoriaAtiva(nome);
    if (!destino) return;
    const topo = Math.max(
      0,
      window.scrollY + destino.getBoundingClientRect().top - 154,
    );
    rolarPara(topo);
  }

  function rolarPara(topo: number) {
    const lenis = lenisRef.current;
    if (lenis) {
      lenis.start();
      lenis.scrollTo(topo, { duration: 0.82 });
      return;
    }
    window.scrollTo({ top: topo, behavior: "smooth" });
  }

  function irParaGrupo(novoGrupo: GrupoMenu) {
    const primeiraCategoria = categorias.find(
      (categoria) => categoria.grupo === novoGrupo,
    );
    setGrupo(novoGrupo);
    if (!primeiraCategoria) return;
    setCategoriaAtiva(primeiraCategoria.nome);
    window.setTimeout(() => irParaCategoria(primeiraCategoria.nome), 0);
  }

  function abrirMenuLateral() {
    setBuscaAberta(false);
    abrirOverlay("menu");
  }

  function irParaTopo() {
    fecharOverlay();
    rolarPara(0);
  }

  if (erroCarregar) return <EstadoErro />;
  if (!dados) return <CardapioSkeleton />;

  const numeroWhatsapp = (dados.whatsappAtendimento ?? "").replace(/\D/g, "");
  const linkWhatsappFlutuante = numeroWhatsapp
    ? `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(`Olá! Estou vendo o cardápio digital da ${dados.nome} e queria falar com vocês.`)}`
    : null;

  return (
    <div
      className="cardapio-theme min-h-dvh bg-[#eee8df] pb-28 text-[#181714] lg:pb-24"
      style={{ fontFamily: "var(--font-lexend)" }}
    >
      <header className="mx-auto max-w-4xl px-4 pt-4 sm:px-6 sm:pt-6 lg:max-w-6xl lg:px-8 lg:pt-5">
        <div className="grid grid-cols-3 items-center py-2">
          <button
            onClick={abrirMenuLateral}
            className="justify-self-start flex h-12 w-12 items-center justify-center rounded-full bg-black/[.035] text-[#181714] transition active:scale-95"
            aria-label="Abrir menu lateral"
          >
            <Menu size={23} strokeWidth={1.8} />
          </button>
          <span className="justify-self-center text-center font-display text-xl font-semibold tracking-[-.04em] sm:text-2xl">
            Menu
          </span>
          <div className="flex items-center justify-self-end gap-2">
            <button
              onClick={() => setBuscaAberta((aberta) => !aberta)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/[.035] text-[#181714] transition active:scale-95"
              aria-label="Buscar no cardápio"
            >
              <Search size={22} strokeWidth={1.8} />
            </button>
            <button
              onClick={() => abrirOverlay("carrinho")}
              className="hidden min-h-12 items-center gap-2 rounded-full bg-[#0e7775] px-4 text-sm font-semibold text-white shadow-lg shadow-[#0e7775]/20 lg:inline-flex"
            >
              <ShoppingBag size={17} />
              {totalItens ? `${totalItens} no pedido` : "Meu pedido"}
            </button>
          </div>
        </div>

        {buscaAberta && (
          <div className="relative mb-4 mt-2">
            <Search
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-black/38"
            />
            <input
              autoFocus
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Busque por prato ou categoria"
              className="min-h-13 w-full rounded-2xl border border-black/[.07] bg-white/75 px-11 text-sm outline-none backdrop-blur focus:border-[#0e7775]/35 focus:ring-4 focus:ring-[#0e7775]/10"
            />
            <button
              onClick={() => {
                setBusca("");
                setBuscaAberta(false);
              }}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-black/45"
              aria-label="Fechar busca"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {buscaAberta && busca.trim() ? (
          <section className="mb-5 rounded-[1.65rem] border border-black/[.06] bg-white/65 p-4 shadow-sm backdrop-blur">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.16em] text-[#0e7775]">
              Resultados
            </p>
            {produtosEncontrados.length ? (
              <div className="grid gap-2">
                {produtosEncontrados.slice(0, 6).map((produto) => (
                  <button
                    key={produto.id}
                    onClick={() => abrirProduto(produto)}
                    className="flex items-center gap-3 rounded-2xl bg-white p-2 text-left"
                  >
                    <span
                      className="h-14 w-14 shrink-0 rounded-xl bg-cover"
                      style={fotoDoProduto(produto)}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate font-display text-sm">
                        {nomeProdutoExibicao(produto)}
                      </strong>
                      <small className="text-[#0e7775]">
                        {moeda(produto.precoVenda)}
                      </small>
                    </span>
                    <ArrowRight size={15} className="text-black/30" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-5 text-center text-sm text-black/45">
                Nenhum item encontrado.
              </p>
            )}
          </section>
        ) : null}

        <div className="relative mt-3 aspect-[16/9] overflow-hidden rounded-[1.4rem] bg-[#181714] shadow-[0_22px_60px_-38px_rgba(0,0,0,.6)] sm:rounded-[1.8rem] lg:mt-4 lg:h-72 lg:aspect-auto lg:rounded-[2rem]">
          <div
            aria-hidden
            className="absolute inset-0 bg-cover transition-opacity duration-700"
            style={
              bannerAtual && dados.bannerModo !== "padrao"
                ? {
                    backgroundImage: `url(${bannerAtual.url})`,
                    backgroundPosition: bannerAtual.enquadramento === "topo" ? "top" : bannerAtual.enquadramento === "base" ? "bottom" : "center",
                  }
                : {
                    background:
                      "radial-gradient(circle at 15% 12%, rgba(215,181,139,.32), transparent 31%), radial-gradient(circle at 88% 88%, rgba(14,119,117,.58), transparent 40%), linear-gradient(125deg, #181714 0%, #26241f 48%, #0e7775 150%)",
                  }
            }
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/35"
          />
          {!bannerAtual || dados.bannerModo === "padrao" ? (
            <>
              <div
                aria-hidden
                className="absolute -right-12 -top-16 h-64 w-64 rounded-full border border-white/15"
              />
              <div
                aria-hidden
                className="absolute -bottom-24 left-8 h-52 w-52 rounded-full border border-white/10"
              />
            </>
          ) : null}
          <a
            href="https://www.instagram.com/otimizaii/"
            target="_blank"
            rel="noreferrer"
            className="absolute left-5 top-5 inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 bg-black/10 py-1.5 pl-2 pr-3 text-white/75 backdrop-blur-md transition hover:border-white/30 hover:bg-white/10 hover:text-white sm:left-7 sm:top-7"
            aria-label="Conheça a otimizaAÍ no Instagram"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#181714]">
              <OhFomeMark className="h-3.5 w-3.5" />
            </span>
            <span className="leading-none">
              <strong className="block text-[10px] font-semibold tracking-[.08em]">
                OhFome
              </strong>
              <small className="mt-1 block text-[8px] font-medium tracking-[.06em] text-white/45">
                por otimizaAÍ
              </small>
            </span>
          </a>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-8">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/60">
                Cardápio digital
              </p>
              <p className="mt-2 max-w-[12rem] break-words font-display text-xl font-semibold leading-none tracking-[-.055em] sm:max-w-xs sm:text-3xl">
                Seu sabor.
                <br />
                Sua marca.
                <br />
                Seu menu.
              </p>
            </div>
            <span className="mb-1 max-w-[42%] truncate rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.14em] backdrop-blur">
              {dados.tipo}
            </span>
          </div>
          {dados.bannerModo === "carrossel" && bannersAtivos.length > 1 && (
            <div className="absolute bottom-4 right-5 flex gap-1.5 sm:bottom-6 sm:right-7">
              {bannersAtivos.map((banner, indice) => (
                <button
                  key={banner.id}
                  onClick={() => setIndiceBanner(indice)}
                  aria-label={`Exibir foto ${indice + 1}`}
                  className={`h-1.5 rounded-full transition-all ${indice === indiceBanner ? "w-6 bg-white" : "w-1.5 bg-white/55 hover:bg-white"}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="relative -mt-12 flex flex-col items-center sm:-mt-14 lg:-mt-16">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-[6px] border-[#eee8df] bg-[#0e7775] text-[#d7b58b] shadow-md sm:h-28 sm:w-28">
            {dados.logoUrl ? (
              <img
                src={dados.logoUrl}
                alt={`Logo ${dados.nome}`}
                className="h-full w-full rounded-full object-cover"
              />
            ) : segmento ? (
              <SegmentIcon segmento={segmento.id} size={38} strokeWidth={1.3} />
            ) : (
              <UtensilsCrossed size={38} strokeWidth={1.3} />
            )}
          </div>
          <button
            onClick={() => abrirOverlay("info")}
            className="mt-3 self-end flex min-h-11 items-center gap-2 rounded-full bg-black/[.035] px-4 text-xs font-semibold text-[#0e7775] transition active:scale-95 sm:absolute sm:right-4 sm:top-16 sm:mt-0"
          >
            <Info size={15} /> Info <ArrowRight size={14} />
          </button>
          <h1 className="mt-4 max-w-full break-words px-3 text-center font-display text-2xl font-semibold tracking-[-.055em] sm:text-3xl">
            {dados.nome}
          </h1>
          <span className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold ${cardapioDisponivel ? "bg-coral-050 text-coral-600" : "bg-danger-050 text-danger-600"}`}>
            <i className={`h-2 w-2 rounded-full ${cardapioDisponivel ? "bg-[#0e7775]" : "bg-[#941c42]"}`} />
            {cardapioDisponivel ? "Delivery aberto agora" : dados.disponibilidade?.motivo ?? "Delivery fechado no momento"}
          </span>
          {dados.disponibilidade?.configurado && <details className="mt-3 w-full max-w-md rounded-2xl border border-black/[.07] bg-white/45 px-4 py-3 text-left text-xs text-black/65"><summary className="cursor-pointer list-none text-center font-semibold text-[#0e7775]">Ver horários de delivery</summary><div className="mt-3 grid gap-2 border-t border-black/[.06] pt-3">{DIAS_SEMANA.map((dia, indice) => { const turnos = dados.disponibilidade?.turnos[String(indice)] ?? []; return <div key={dia} className="grid grid-cols-[3.2rem_minmax(0,1fr)] gap-3"><span className="font-medium text-black/70">{dia}</span><span className="text-right break-words">{turnos.length ? turnos.map((turno) => `${turno.inicio}–${turno.fim}`).join(" · ") : "Fechado"}</span></div>; })}</div></details>}
        </div>
      </header>

      <div className="sticky top-0 z-30 mt-6 border-y border-black/[.07] bg-[#eee8df]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl lg:max-w-6xl lg:px-8">
          <div className="flex h-14 items-end gap-8 overflow-x-auto px-5 sm:px-6">
            {(["comidas", "bebidas"] as GrupoMenu[])
              .filter((item) => gruposDisponiveis[item])
              .map((item) => (
                <button
                  key={item}
                  onClick={() => irParaGrupo(item)}
                  className={`relative h-full shrink-0 px-1 text-sm font-medium capitalize transition-colors ${grupoAtivo === item ? "text-[#0e7775]" : "text-black/70"}`}
                >
                  {item}
                  {grupoAtivo === item && (
                    <i className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-[#0e7775]" />
                  )}
                </button>
              ))}
          </div>
          <div className="flex h-16 items-center gap-2 overflow-x-auto border-t border-black/[.045] px-4 sm:px-6">
            {categoriasVisiveis.map((categoria) => (
              <button
                key={categoria.nome}
                onClick={() => irParaCategoria(categoria.nome)}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all ${categoriaAtivaExibida === categoria.nome ? "bg-[#0e7775] text-white shadow-md shadow-[#0e7775]/20" : "text-black/75 hover:bg-white/50"}`}
              >
                <CategoryIcon
                  categoria={categoria.nome}
                  size={15}
                  strokeWidth={1.7}
                />
                {categoria.nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:max-w-6xl lg:px-8">
        {categorias.length === 0 && (
          <section className="flex min-h-64 flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-black/[.12] bg-white/35 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0e7775] shadow-sm">
              <ShoppingBag size={20} />
            </span>
            <h2 className="mt-4 font-display text-xl font-semibold tracking-[-.04em]">
              Cardápio em preparação
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-black/55">
              Este estabelecimento ainda está organizando os itens. Volte em
              breve para fazer seu pedido.
            </p>
          </section>
        )}
        {categoriasVisiveis.map((categoria) => (
          <section
            key={categoria.nome}
            data-categoria={categoria.nome}
            ref={(elemento) => {
              refsCategoria.current[categoria.nome] = elemento;
            }}
            className="scroll-mt-40 pt-9 lg:pt-12"
          >
            <div className="mb-4 flex items-end justify-between border-b border-black/[.1] pb-4">
              <h2 className="font-display text-2xl font-semibold tracking-[-.055em] text-[#0e7775]">
                {categoria.nome}
              </h2>
              <span className="text-[10px] font-medium uppercase tracking-[.12em] text-black/35">
                {categoria.itens.length}{" "}
                {categoria.itens.length === 1 ? "item" : "itens"}
              </span>
            </div>
            <div className="lg:grid lg:grid-cols-2 lg:gap-x-10">
              {categoria.itens.map((produto) => {
                const quantidade = carrinho[produto.id] ?? 0;
                return (
                  <button
                    key={produto.id}
                    onClick={() => abrirProduto(produto)}
                    className="group grid w-full grid-cols-[112px_1fr] gap-4 border-b border-black/[.09] py-5 text-left transition active:scale-[.99] sm:grid-cols-[148px_1fr] sm:gap-6 sm:py-6 lg:grid-cols-[126px_1fr] lg:gap-5 lg:py-5"
                  >
                    <span
                      className="relative aspect-square overflow-hidden rounded-2xl bg-[#d8d0c6] bg-cover transition-transform duration-300 group-hover:scale-[1.015]"
                      style={fotoDoProduto(produto)}
                    >
                      {quantidade > 0 && (
                        <i className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-[#941c42] px-2 text-[11px] font-semibold not-italic text-white shadow-md">
                          {quantidade}
                        </i>
                      )}
                    </span>
                    <span className="min-w-0 self-center">
                      <strong className="block font-display text-[17px] font-semibold leading-[1.08] tracking-[-.035em] text-[#181714] sm:text-[21px]">
                        {nomeProdutoExibicao(produto)}
                      </strong>
                      <b className="mt-1.5 block text-sm font-semibold text-[#0e7775] sm:text-base">
                        {moeda(produto.precoVenda)}
                      </b>
                      <small className="mt-2 block overflow-hidden text-[12px] leading-[1.55] text-black/65 sm:max-w-xl sm:text-sm">
                        {descricaoDoProduto(produto)}
                      </small>
                      <span className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[.1em] text-black/35">
                        Ver detalhes <ArrowRight size={12} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <div className="flex flex-col items-center py-14 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[#0e7775]">
            <Sparkles size={16} />
          </span>
          <p className="mt-3 font-display text-sm font-semibold">
            Feito com cuidado, servido com presença.
          </p>
          <img
            src="/marca/ohfome-icone-quadrado.png"
            alt="OhFome"
            className="mt-4 h-10 w-10 rounded-xl"
          />
          <small className="mt-1 text-[10px] uppercase tracking-[.14em] text-black/35">
            Cardápio digital
          </small>
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[.08] bg-[#eee8df]/97 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-4 px-2">
          <BottomAction
            ativo
            label="Menu"
            icon={BookOpenText}
            onClick={irParaTopo}
          />
          <BottomAction
            label="Pedido"
            icon={ShoppingBag}
            badge={totalItens}
            onClick={() => abrirOverlay("carrinho")}
          />
          {pedidoAtivo ? (
            <BottomAction
              label="Meus pedidos"
              icon={PackageSearch}
              destaque
              onClick={() => abrirOverlay("pedidos")}
            />
          ) : (
            <BottomAction
              label="Atendimento"
              icon={MessageCircle}
              onClick={() => abrirOverlay("info")}
            />
          )}
          <BottomAction
            label="Info"
            icon={CircleHelp}
            onClick={() => abrirOverlay("info")}
          />
        </div>
      </nav>

      {overlay === "produto" && produtoSelecionado && (
        <ProdutoDetalhe
          produto={produtoSelecionado}
          quantidade={carrinho[produtoSelecionado.id] ?? 0}
          observacao={observacoesItens[produtoSelecionado.id] ?? ""}
          ajustar={ajustar}
          onAtualizarObservacao={atualizarObservacaoItem}
          onFechar={fecharOverlay}
          onAbrirCarrinho={() => abrirOverlay("carrinho")}
          onAdicionarAoPedido={() => adicionarEVoltarAoCardapio(produtoSelecionado)}
          disponivel={cardapioDisponivel}
          motivoIndisponivel={dados.disponibilidade?.motivo ?? "O delivery está fechado no momento."}
        />
      )}
      {overlay === "carrinho" && (
        <CarrinhoSheet
          slug={slug}
          dados={dados}
          carrinho={carrinho}
          observacoesItens={observacoesItens}
          ajustar={ajustar}
          onAtualizarObservacao={atualizarObservacaoItem}
          totalValor={totalValor}
          onFechar={fecharOverlay}
          onConfirmado={(codigo, whatsapp, pedidoId) => {
            limparCarrinho();
            setCodigoPedido(codigo);
            setLinkWhatsapp(whatsapp);
            setPagamentoPixConfirmado(false);
            const ativo = { id: pedidoId, codigo };
            setPedidoAtivo(ativo);
            try {
              window.localStorage.setItem(
                chavePedidoAtivo(slug),
                JSON.stringify(ativo),
              );
            } catch {
              /* localStorage indisponível */
            }
            abrirOverlay("sucesso");
          }}
          onAguardandoPix={(cobranca) => {
            limparCarrinho();
            setPagamentoPixConfirmado(false);
            const ativo = { id: cobranca.pedidoId, codigo: cobranca.codigo };
            setPedidoAtivo(ativo);
            setCobrancaPix(cobranca);
            try {
              window.localStorage.setItem(
                chavePedidoAtivo(slug),
                JSON.stringify(ativo),
              );
            } catch {
              /* localStorage indisponível */
            }
            abrirOverlay("pix");
          }}
          disponivel={cardapioDisponivel}
          motivoIndisponivel={dados.disponibilidade?.motivo ?? "Não estamos recebendo pedidos no momento."}
        />
      )}
      {avisoCarrinho && (
        <div className="fixed inset-x-4 bottom-24 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#181714] p-3.5 text-sm text-white shadow-2xl sm:bottom-6">
          <Check size={18} className="shrink-0 text-[#d7b58b]" />
          <span className="min-w-0 flex-1 leading-5">{avisoCarrinho}</span>
          {cardapioDisponivel && totalItens > 0 && <button type="button" onClick={() => { setAvisoCarrinho(null); abrirOverlay("carrinho"); }} className="shrink-0 rounded-full bg-white/12 px-3 py-2 text-xs font-semibold">Ver pedido</button>}
        </div>
      )}
      {overlay === "pix" && cobrancaPix && (
        <TelaPix
          slug={slug}
          cobranca={cobrancaPix}
          onPago={() => {
            setCodigoPedido(cobrancaPix.codigo);
            setLinkWhatsapp(null);
            setPagamentoPixConfirmado(true);
            abrirOverlay("sucesso");
          }}
          onFechar={() => abrirOverlay("pedidos")}
        />
      )}
      {overlay === "info" && (
        <InfoSheet dados={dados} onFechar={fecharOverlay} />
      )}
      {overlay === "menu" && (
        <MenuLateral
          dados={dados}
          categorias={categorias}
          categoriaAtiva={categoriaAtivaExibida}
          carrinhoItens={totalItens}
          onFechar={fecharOverlay}
          onSelecionar={(nome) => {
            fecharOverlay();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => irParaCategoria(nome)),
            );
          }}
          onAbrirPedido={() => abrirOverlay("carrinho")}
          onAbrirInfo={() => abrirOverlay("info")}
        />
      )}
      {overlay === "sucesso" && (
        <TelaSucesso
          codigo={codigoPedido}
          whatsappUrl={linkWhatsapp}
          pagamentoPixConfirmado={pagamentoPixConfirmado}
          temAcompanhamento={Boolean(pedidoAtivo)}
          onAcompanhar={() => abrirOverlay("pedidos")}
          onNovoPedido={fecharOverlay}
        />
      )}
      {overlay === "pedidos" && pedidoAtivo && (
        <PedidoSheet
          slug={slug}
          pedidoId={pedidoAtivo.id}
          produtos={dados.produtos}
          numeroWhatsapp={numeroWhatsapp}
          onFechar={fecharOverlay}
        />
      )}
      {!overlay && linkWhatsappFlutuante && (
        <BotaoWhatsapp href={linkWhatsappFlutuante} />
      )}
    </div>
  );
}

function BotaoWhatsapp({ href }: { href: string }) {
  const [notificacaoVisivel, setNotificacaoVisivel] = useState(false);

  useEffect(() => {
    try {
      setNotificacaoVisivel(window.localStorage.getItem("ohfome_whatsapp_visto") !== "1");
    } catch {
      setNotificacaoVisivel(true);
    }
  }, []);

  function aoClicar() {
    try {
      window.localStorage.setItem("ohfome_whatsapp_visto", "1");
    } catch {
      /* localStorage indisponível — segue sem lembrar */
    }
    setNotificacaoVisivel(false);
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={aoClicar}
      aria-label="Falar no WhatsApp com o estabelecimento"
      className="group fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-30 flex items-center lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] lg:right-6"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-full bg-[#181714] px-3.5 py-2 text-xs font-semibold text-white opacity-0 shadow-[0_10px_24px_-8px_rgba(0,0,0,.45)] transition-all duration-200 group-hover:opacity-100 lg:block"
      >
        Fale conosco
        <span aria-hidden className="absolute left-full top-1/2 -ml-[3px] h-2 w-2 -translate-y-1/2 rotate-45 bg-[#181714]" />
      </span>
      <span
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-[0_12px_28px_-8px_rgba(13,138,73,.65),0_3px_10px_rgba(0,0,0,.18)] transition-transform duration-200 group-hover:scale-105 group-active:scale-90"
        style={{ background: "radial-gradient(circle at 30% 22%, #52e08f 0%, transparent 55%), linear-gradient(155deg, #27d366 0%, #109e56 55%, #0a7a45 100%)" }}
      >
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full opacity-45 motion-safe:animate-ping motion-reduce:hidden"
          style={{ background: "#1fbf5c", animationDuration: "2.4s" }}
        />
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
          <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.32 4.95L2 22l5.24-1.37a9.9 9.9 0 0 0 4.8 1.23h.01c5.5 0 9.96-4.46 9.96-9.96S17.55 2 12.04 2Zm5.83 14.24c-.25.7-1.24 1.28-2.02 1.44-.54.11-1.24.2-3.6-.77-3.02-1.25-4.97-4.3-5.12-4.5-.15-.2-1.22-1.62-1.22-3.1 0-1.47.77-2.19 1.05-2.49.27-.3.6-.37.8-.37.2 0 .4 0 .58.01.19.01.44-.07.68.53.25.6.85 2.08.92 2.23.07.15.12.33.02.53-.09.2-.14.32-.28.5-.14.17-.29.38-.42.51-.14.14-.28.29-.12.57.16.27.71 1.19 1.53 1.93 1.05.95 1.94 1.25 2.21 1.39.27.14.43.12.6-.07.16-.19.68-.8.86-1.07.18-.27.36-.23.6-.14.25.09 1.58.75 1.85.89.27.14.45.2.51.32.07.12.07.68-.18 1.38Z" />
        </svg>
        {notificacaoVisivel && (
          <i aria-hidden className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#eee8df] bg-[#e0333f] text-[10px] font-bold not-italic leading-none text-white">
            1
          </i>
        )}
      </span>
    </a>
  );
}

function BottomAction({
  label,
  icon: Icon,
  onClick,
  ativo,
  destaque,
  badge = 0,
}: {
  label: string;
  icon: typeof BookOpenText;
  onClick: () => void;
  ativo?: boolean;
  destaque?: boolean;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex min-h-[62px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition active:scale-95 ${ativo ? "text-[#0e7775]" : "text-black/58"}`}
    >
      <span className="relative">
        <Icon size={21} strokeWidth={1.7} />
        {badge > 0 && (
          <i className="absolute -right-3 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#941c42] px-1 text-[9px] font-bold not-italic text-white">
            {badge}
          </i>
        )}
        {destaque && badge === 0 && (
          <i className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-[#0e7775] ring-2 ring-[#eee8df]" />
        )}
      </span>
      {label}
    </button>
  );
}

function MenuLateral({
  dados,
  categorias,
  categoriaAtiva,
  carrinhoItens,
  onFechar,
  onSelecionar,
  onAbrirPedido,
  onAbrirInfo,
}: {
  dados: CardapioData;
  categorias: { nome: string; grupo: GrupoMenu; itens: ProdutoPublico[] }[];
  categoriaAtiva: string | null;
  carrinhoItens: number;
  onFechar: () => void;
  onSelecionar: (nome: string) => void;
  onAbrirPedido: () => void;
  onAbrirInfo: () => void;
}) {
  const painelRef = usePainelAcessivel(onFechar);
  return (
    <div
      className="fixed inset-0 z-[60] flex bg-black/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Navegação do cardápio"
    >
      <aside
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-lateral-titulo"
        tabIndex={-1}
        className="flex min-h-full w-[min(88vw,360px)] flex-col bg-[#f4eee6] shadow-2xl outline-none animate-in slide-in-from-left duration-200"
      >
        <header className="border-b border-black/[.08] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#0e7775]">
                Navegue pelo menu
              </p>
              <h2 id="menu-lateral-titulo" className="mt-1 truncate font-display text-2xl font-semibold tracking-[-.055em]">
                {dados.nome}
              </h2>
            </div>
            <button
              onClick={onFechar}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[.045] text-[#181714] active:scale-95"
              aria-label="Fechar menu"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div
          data-lenis-prevent
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
        >
          {(["comidas", "bebidas"] as GrupoMenu[]).map((grupo) => {
            const itensDoGrupo = categorias.filter(
              (categoria) => categoria.grupo === grupo,
            );
            if (!itensDoGrupo.length) return null;
            return (
              <section key={grupo} className="mb-6">
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-black/38">
                  {grupo}
                </p>
                <div className="space-y-1">
                  {itensDoGrupo.map((categoria) => (
                    <button
                      key={categoria.nome}
                      onClick={() => onSelecionar(categoria.nome)}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left transition active:scale-[.98] ${categoriaAtiva === categoria.nome ? "bg-[#0e7775] text-white shadow-md shadow-[#0e7775]/20" : "text-black/72 hover:bg-black/[.04]"}`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${categoriaAtiva === categoria.nome ? "bg-white/14" : "bg-white/75 text-[#0e7775]"}`}
                      >
                        <CategoryIcon
                          categoria={categoria.nome}
                          size={16}
                          strokeWidth={1.7}
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {categoria.nome}
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${categoriaAtiva === categoria.nome ? "text-white/75" : "text-black/35"}`}
                      >
                        {categoria.itens.length}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="space-y-2 border-t border-black/[.08] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={onAbrirPedido}
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-[#181714] px-4 text-left text-sm font-semibold text-white active:scale-[.98]"
          >
            <ShoppingBag size={17} />
            <span className="flex-1">Meu pedido</span>
            {carrinhoItens > 0 && (
              <span className="rounded-full bg-[#941c42] px-2 py-0.5 text-[10px]">
                {carrinhoItens}
              </span>
            )}
          </button>
          <button
            onClick={onAbrirInfo}
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-white/70 px-4 text-left text-sm font-semibold text-[#181714] active:scale-[.98]"
          >
            <Info size={17} className="text-[#0e7775]" /> Informações da casa
          </button>
        </footer>
      </aside>
      <button
        onClick={onFechar}
        className="min-w-0 flex-1"
        aria-label="Fechar menu tocando fora"
      />
    </div>
  );
}

function usePainelAcessivel(onFechar: () => void) {
  const painelRef = useRef<HTMLElement | null>(null);
  const fecharAtual = useRef(onFechar);

  useEffect(() => {
    fecharAtual.current = onFechar;
  }, [onFechar]);

  useEffect(() => {
    const focoAnterior = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    const paddingAnterior = document.body.style.paddingRight;
    const larguraDaBarra = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (larguraDaBarra > 0)
      document.body.style.paddingRight = `${larguraDaBarra}px`;

    const focarPainel = () => painelRef.current?.focus();
    const temporizador = window.setTimeout(focarPainel, 0);
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        fecharAtual.current();
        return;
      }
      if (evento.key !== "Tab" || !painelRef.current) return;
      const focoPossivel = Array.from(
        painelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((elemento) => !elemento.hasAttribute("aria-hidden"));
      if (!focoPossivel.length) {
        evento.preventDefault();
        focarPainel();
        return;
      }
      const primeiro = focoPossivel[0];
      const ultimo = focoPossivel.at(-1)!;
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      window.clearTimeout(temporizador);
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      document.body.style.paddingRight = paddingAnterior;
      focoAnterior?.focus?.();
    };
  }, []);

  return painelRef;
}

function ProdutoDetalhe({
  produto,
  quantidade,
  observacao,
  ajustar,
  onAtualizarObservacao,
  onFechar,
  onAbrirCarrinho,
  onAdicionarAoPedido,
  disponivel,
  motivoIndisponivel,
}: {
  produto: ProdutoPublico;
  quantidade: number;
  observacao: string;
  ajustar: (id: string, delta: number) => void;
  onAtualizarObservacao: (id: string, observacao: string) => void;
  onFechar: () => void;
  onAbrirCarrinho: () => void;
  onAdicionarAoPedido: () => void;
  disponivel: boolean;
  motivoIndisponivel: string;
}) {
  const painelRef = usePainelAcessivel(onFechar);
  return (
    <div
      data-lenis-prevent
      className="fixed inset-0 z-50 overflow-y-auto bg-[#eee8df] sm:flex sm:items-center sm:justify-center sm:overflow-hidden sm:bg-black/55 sm:p-6 sm:backdrop-blur-sm"
    >
      <article
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="produto-detalhe-titulo"
        tabIndex={-1}
        className="relative mx-auto min-h-dvh max-w-3xl overflow-hidden bg-[#eee8df] outline-none sm:min-h-0 sm:w-full sm:rounded-[2rem] sm:shadow-2xl lg:grid lg:h-[min(82dvh,42rem)] lg:max-w-5xl lg:grid-cols-[minmax(22rem,.92fr)_minmax(0,1.08fr)] lg:rounded-[2.25rem]"
      >
        <div
          className="relative aspect-[4/3] max-h-[45dvh] bg-cover bg-center lg:h-full lg:max-h-none lg:aspect-auto"
          style={fotoDoProduto(produto)}
        >
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/25 to-transparent" />
          <span className="absolute left-1/2 top-4 h-1.5 w-14 -translate-x-1/2 rounded-full bg-white/75 lg:hidden" />
          <button
            onClick={onFechar}
            className="absolute right-4 top-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-black/55 px-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-black/70"
            aria-label="Voltar ao cardápio"
          >
            <ArrowLeft size={18} />
            <span>Voltar</span>
          </button>
        </div>
        <div className="p-5 pb-36 sm:p-8 sm:pb-32 lg:max-h-full lg:overflow-y-auto lg:p-9 lg:pb-36">
          <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#0e7775]">
            {produto.categoriaNome}
          </p>
          <h2 id="produto-detalhe-titulo" className="mt-2 font-display text-3xl font-semibold uppercase leading-[1.02] tracking-[-.055em] sm:text-4xl">
            {nomeProdutoExibicao(produto)}
          </h2>
          <p className="mt-3 font-display text-2xl font-semibold text-[#0e7775]">
            {moeda(produto.precoVenda)}
          </p>
          <p className="mt-7 text-base leading-7 text-black/70 sm:max-w-2xl sm:text-lg sm:leading-8">
            {descricaoDoProduto(produto)}
          </p>
          {!disponivel && (
            <div className="mt-6 rounded-2xl border border-[#941c42]/15 bg-[#941c42]/[.07] p-4 text-sm leading-5 text-[#941c42]">
              <b className="block">Delivery fechado</b>
              <span>{motivoIndisponivel} Consulte os horários no início do cardápio.</span>
            </div>
          )}
          <label className="mt-7 block rounded-2xl border border-coral-100 bg-coral-050 p-4">
            <span className="block text-xs font-semibold text-[#0e7775]">
              Observação deste item
            </span>
            <span className="mt-1 block text-[11px] leading-4 text-black/50">
              Ex.: sem cebola, carne bem passada ou sem gelo.
            </span>
            <textarea
              value={observacao}
              onChange={(evento) =>
                onAtualizarObservacao(produto.id, evento.target.value)
              }
              placeholder="Adicionar observação"
              rows={2}
              maxLength={1000}
              className="mt-3 w-full resize-none rounded-xl border border-black/[.09] bg-white/80 px-3 py-2.5 text-sm outline-none transition focus:border-[#0e7775]/45 focus:ring-4 focus:ring-[#0e7775]/10"
            />
          </label>
          <h3 className="mt-9 font-display text-lg font-semibold">Detalhes</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <DetailTag icon={UtensilsCrossed} label={produto.categoriaNome} />
            {produto.tamanho && <DetailTag icon={Info} label={`Tamanho ${produto.tamanho}`} />}
            <DetailTag icon={Sparkles} label="Feito na casa" />
            <DetailTag icon={Info} label="Consulte ingredientes" />
          </div>
          <div className="mt-9 rounded-2xl border border-black/[.07] bg-white/45 p-4">
            <p className="text-xs font-semibold">Tem alguma dúvida?</p>
            <p className="mt-1 text-xs leading-5 text-black/50">
              Fale com o estabelecimento sobre ingredientes, alergênicos ou
              preparo.
            </p>
            <button className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-[#0e7775] shadow-sm">
              <MessageCircle size={15} /> Tirar dúvida
            </button>
          </div>
        </div>
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-black/[.07] bg-[#eee8df]/96 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:absolute lg:left-[46%]">
          <div className="mx-auto flex max-w-2xl items-center gap-3 lg:max-w-none">
            <div className="flex shrink-0 items-center rounded-full bg-white p-1 shadow-sm">
              <button
                onClick={() => ajustar(produto.id, -1)}
                disabled={quantidade === 0 || !disponivel}
                className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-25"
                aria-label="Remover"
              >
                <Minus size={17} />
              </button>
              <strong className="w-7 text-center font-display">
                {quantidade}
              </strong>
              <button
                onClick={() => ajustar(produto.id, 1)}
                disabled={!disponivel}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#181714] text-white"
                aria-label="Adicionar"
              >
                <Plus size={17} />
              </button>
            </div>
            <button
              onClick={() => {
                if (quantidade === 0) onAdicionarAoPedido();
                else onAbrirCarrinho();
              }}
              disabled={!disponivel}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-[#0e7775] px-5 text-sm font-semibold text-white shadow-lg shadow-[#0e7775]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!disponivel ? "Delivery fechado" : quantidade === 0 ? "Adicionar ao pedido" : "Ver pedido"}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

function DetailTag({
  icon: Icon,
  label,
}: {
  icon: typeof Info;
  label: string;
}) {
  return (
    <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/[.1] bg-white/35 px-3.5 text-xs text-black/65">
      <Icon size={14} strokeWidth={1.7} />
      {label}
    </span>
  );
}

interface ClienteSalvo {
  nome: string;
  telefone: string;
  cpf: string;
  email?: string;
  notificar: boolean;
}

function carregarClienteSalvo(slug: string): ClienteSalvo | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(`ohfome_cliente_${slug}`);
    return bruto ? (JSON.parse(bruto) as ClienteSalvo) : null;
  } catch {
    return null;
  }
}

interface BairroPublico {
  id: string;
  nome: string;
  taxa: number;
}

function CarrinhoSheet({
  slug,
  dados,
  carrinho,
  observacoesItens,
  ajustar,
  onAtualizarObservacao,
  totalValor,
  onFechar,
  onConfirmado,
  onAguardandoPix,
  disponivel,
  motivoIndisponivel,
}: {
  slug: string;
  dados: CardapioData;
  carrinho: Record<string, number>;
  observacoesItens: Record<string, string>;
  ajustar: (id: string, delta: number) => void;
  onAtualizarObservacao: (id: string, observacao: string) => void;
  totalValor: number;
  onFechar: () => void;
  onConfirmado: (
    codigo: number,
    whatsappUrl: string | null,
    pedidoId: string,
  ) => void;
  onAguardandoPix: (cobranca: CobrancaPix) => void;
  disponivel: boolean;
  motivoIndisponivel: string;
}) {
  const painelRef = usePainelAcessivel(onFechar);
  const [etapa, setEtapa] = useState<"itens" | "dados" | "pagamento">("itens");
  const clienteSalvo = useMemo(() => carregarClienteSalvo(slug), [slug]);
  const { dados: bairros } = usePolling<BairroPublico[]>(
    `/api/publico/${slug}/bairros`,
    60000,
  );
  const [nome, setNome] = useState(() => clienteSalvo?.nome ?? "");
  const [telefone, setTelefone] = useState(() => clienteSalvo?.telefone ?? "");
  const [cpf, setCpf] = useState(() => clienteSalvo?.cpf ?? "");
  const [email, setEmail] = useState(() => clienteSalvo?.email ?? "");
  const [notificar, setNotificar] = useState(
    () => clienteSalvo?.notificar ?? true,
  );
  const [rua, setRua] = useState("");
  const [numeroEndereco, setNumeroEndereco] = useState("");
  const [complementoEndereco, setComplementoEndereco] = useState("");
  const [bairroId, setBairroId] = useState("");
  const [formaRecebimento, setFormaRecebimento] = useState<
    "entrega" | "retirada"
  >("entrega");
  const [formaPagamento, setFormaPagamento] = useState<
    "cartao" | "dinheiro" | "pix"
  >("cartao");
  const [tipoCartao, setTipoCartao] = useState<"credito" | "debito">("credito");
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [trocoPara, setTrocoPara] = useState("");
  const [dividirPagamento, setDividirPagamento] = useState(false);
  const [valorParte1, setValorParte1] = useState("");
  const [forma2, setForma2] = useState<"cartao" | "dinheiro" | "pix">("dinheiro");
  const [tipoCartao2, setTipoCartao2] = useState<"credito" | "debito">("credito");
  const [precisaTroco2, setPrecisaTroco2] = useState(false);
  const [trocoPara2, setTrocoPara2] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const itens = Object.entries(carrinho)
    .map(([id, quantidade]) => ({
      produto: dados.produtos.find((produto) => produto.id === id),
      quantidade,
      observacoes: (observacoesItens[id] ?? "").trim(),
    }))
    .filter(
      (
        item,
      ): item is {
        produto: ProdutoPublico;
        quantidade: number;
        observacoes: string;
      } => Boolean(item.produto),
    );
  const entregaSelecionada = formaRecebimento === "entrega";
  const bairroSelecionado = (bairros ?? []).find((b) => b.id === bairroId);
  const taxaEntrega = entregaSelecionada ? (bairroSelecionado?.taxa ?? 0) : 0;
  const totalComTaxa = totalValor + taxaEntrega;
  const valorParte1Numero = numeroDaMoeda(valorParte1);
  const valorParte2Numero = Math.max(0, Math.round((totalComTaxa - valorParte1Numero) * 100) / 100);
  const usaPixMercadoPagoNaDivisao = dividirPagamento && dados.pix?.modo === "mercado_pago" && (formaPagamento === "pix" || forma2 === "pix");
  useEffect(() => {
    if (dividirPagamento && forma2 === formaPagamento) {
      setForma2((["cartao", "dinheiro", "pix"] as const).find((f) => f !== formaPagamento && (f !== "pix" || dados.pix)) ?? "dinheiro");
    }
  }, [dividirPagamento, formaPagamento, forma2, dados.pix]);
  const enderecoFormatado = [
    rua.trim() && `${rua.trim()}, ${numeroEndereco.trim()}`,
    complementoEndereco.trim(),
  ].filter(Boolean).join(" · ");

  function validarDados() {
    if (!nome.trim() || telefone.trim().length < 8) {
      setErro("Preencha seu nome e WhatsApp.");
      return false;
    }
    if (entregaSelecionada && !bairroId) {
      setErro("Selecione o bairro de entrega.");
      return false;
    }
    if (entregaSelecionada && !rua.trim()) {
      setErro("Informe a rua ou avenida para entrega.");
      return false;
    }
    if (entregaSelecionada && !numeroEndereco.trim()) {
      setErro("Informe o número do endereço.");
      return false;
    }
    setErro("");
    return true;
  }

  async function confirmar() {
    if (!disponivel) {
      setErro(motivoIndisponivel);
      return;
    }
    if (!validarDados()) return;
    const emailPagador = email.trim();
    const usaPixMpNaParte1 = formaPagamento === "pix" && dados.pix?.modo === "mercado_pago";
    const usaPixMpNaParte2 = dividirPagamento && forma2 === "pix" && dados.pix?.modo === "mercado_pago";
    if (
      (usaPixMpNaParte1 || usaPixMpNaParte2) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPagador)
    ) {
      setErro("Informe um e-mail válido para gerar o Pix.");
      return;
    }
    if (
      !dividirPagamento &&
      formaPagamento === "dinheiro" &&
      precisaTroco &&
      numeroDaMoeda(trocoPara) <= 0
    ) {
      setErro("Informe o valor para o qual precisa de troco.");
      return;
    }
    if (dividirPagamento) {
      if (formaPagamento === forma2) {
        setErro("As duas formas de pagamento precisam ser diferentes.");
        return;
      }
      if (valorParte1Numero <= 0 || valorParte2Numero <= 0) {
        setErro("Informe o valor de cada parte do pagamento.");
        return;
      }
      if (precisaTroco && numeroDaMoeda(trocoPara) <= 0) {
        setErro("Informe o valor para o qual precisa de troco na 1ª parte.");
        return;
      }
      if (precisaTroco2 && numeroDaMoeda(trocoPara2) <= 0) {
        setErro("Informe o valor para o qual precisa de troco na 2ª parte.");
        return;
      }
    }
    setEnviando(true);
    setErro("");
    const resposta = await fetch(`/api/publico/${slug}/pedidos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteNome: nome,
        telefone,
        cpf,
        email: emailPagador,
        notificar,
        formaRecebimento,
        endereco: enderecoFormatado,
        rua: rua.trim(),
        numero: numeroEndereco.trim(),
        complemento: complementoEndereco.trim() || undefined,
        bairroId: entregaSelecionada ? bairroId : undefined,
        formaPagamento: dividirPagamento ? "misto" : formaPagamento,
        tipoCartao: !dividirPagamento && formaPagamento === "cartao" ? tipoCartao : null,
        trocoPara:
          !dividirPagamento && formaPagamento === "dinheiro" && precisaTroco
            ? numeroDaMoeda(trocoPara)
            : null,
        pagamentoDividido: dividirPagamento
          ? [
              {
                forma: formaPagamento,
                valor: valorParte1Numero,
                tipoCartao: formaPagamento === "cartao" ? tipoCartao : undefined,
                trocoPara: formaPagamento === "dinheiro" && precisaTroco ? numeroDaMoeda(trocoPara) : undefined,
              },
              {
                forma: forma2,
                valor: valorParte2Numero,
                tipoCartao: forma2 === "cartao" ? tipoCartao2 : undefined,
                trocoPara: forma2 === "dinheiro" && precisaTroco2 ? numeroDaMoeda(trocoPara2) : undefined,
              },
            ]
          : undefined,
        observacoes,
        itens: itens.map((item) => ({
          produtoId: item.produto.id,
          quantidade: item.quantidade,
          observacoes: item.observacoes || undefined,
        })),
      }),
    });
    setEnviando(false);
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null);
      setErro(corpo?.erro ?? "Não foi possível enviar o pedido.");
      return;
    }
    const pedido = await resposta.json();
    try {
      window.localStorage.setItem(
        `ohfome_cliente_${slug}`,
        JSON.stringify({
          nome: nome.trim(),
          telefone: telefone.trim(),
          cpf: cpf.trim(),
          email: emailPagador,
          notificar,
        }),
      );
    } catch {
      /* localStorage indisponível (modo privado etc.) — segue sem salvar */
    }
    const numero = (dados.whatsappAtendimento ?? "").replace(/\D/g, "");
    if (pedido.cobranca?.qrCodeBase64 && pedido.cobranca?.copiaCola) {
      onAguardandoPix({
        pedidoId: pedido.id,
        codigo: pedido.codigo,
        qrCodeBase64: pedido.cobranca.qrCodeBase64,
        copiaCola: pedido.cobranca.copiaCola,
        expiraEm: pedido.cobranca.expiraEm,
      });
      return;
    }
    function textoForma(forma: "cartao" | "dinheiro" | "pix", tipo: "credito" | "debito", troco: boolean, valorTroco: string) {
      if (forma === "cartao") return `Cartão · ${tipo === "credito" ? "Crédito" : "Débito"}`;
      if (forma === "pix") return "Pix na entrega";
      return troco ? `Dinheiro · troco para ${moeda(numeroDaMoeda(valorTroco))}` : "Dinheiro";
    }
    const pagamento = dividirPagamento
      ? `${textoForma(formaPagamento, tipoCartao, precisaTroco, trocoPara)} (${moeda(valorParte1Numero)}) + ${textoForma(forma2, tipoCartao2, precisaTroco2, trocoPara2)} (${moeda(valorParte2Numero)})`
      : formaPagamento === "cartao"
        ? `Cartão · ${tipoCartao === "credito" ? "Crédito" : "Débito"}`
        : formaPagamento === "pix"
          ? "Pix na entrega"
          : "Dinheiro";
    const mensagem = [
      `Olá! Acabei de fazer o pedido *#${pedido.codigo}* pelo cardápio digital.`,
      "",
      `*Cliente:* ${nome.trim()}`,
      `*WhatsApp:* ${telefone.trim()}`,
      `*Recebimento:* ${formaRecebimento === "entrega" ? "Entrega" : "Retirada no estabelecimento"}`,
      `*Pagamento:* ${pagamento}`,
      !dividirPagamento && formaPagamento === "dinheiro" && precisaTroco
        ? `*Troco para:* ${moeda(numeroDaMoeda(trocoPara))}`
        : "",
      entregaSelecionada ? `*Bairro:* ${bairroSelecionado?.nome ?? ""}` : "",
      entregaSelecionada ? `*Endereço:* ${enderecoFormatado}` : "",
      entregaSelecionada && taxaEntrega > 0
        ? `*Taxa de entrega:* ${moeda(taxaEntrega)}`
        : "",
      observacoes.trim() ? `*Observações gerais:* ${observacoes.trim()}` : "",
      "",
      "*Itens:*",
      ...itens.map(
        (item) =>
          `${item.quantidade}× ${nomeProdutoExibicao(item.produto)} — ${moeda(item.produto.precoVenda * item.quantidade)}${item.observacoes ? `\n   Obs.: ${item.observacoes}` : ""}`,
      ),
      "",
      `*Total:* ${moeda(totalComTaxa)}`,
    ]
      .filter(Boolean)
      .join("\n");
    onConfirmado(
      pedido.codigo,
      numero.length >= 10
        ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
        : null,
      pedido.id,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-6">
      <section
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="carrinho-titulo"
        tabIndex={-1}
        className="flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-[#eee8df] shadow-2xl outline-none sm:max-h-[90dvh] sm:rounded-[2rem]"
      >
        <header className="flex items-center justify-between border-b border-black/[.08] p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#0e7775]">
              Seu pedido
            </p>
            <h2 id="carrinho-titulo" className="mt-1 font-display text-2xl font-semibold tracking-[-.05em]">
              {etapa === "itens"
                ? "Revise sua seleção"
                : etapa === "dados"
                  ? "Entrega e contato"
                  : "Pagamento e confirmação"}
            </h2>
          </div>
          <button
            onClick={onFechar}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/70"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>
        {!disponivel && <div className="mx-5 mt-4 rounded-2xl border border-danger-500/15 bg-danger-050 p-3 text-sm leading-5 text-danger-600 sm:mx-6">{motivoIndisponivel} Você pode consultar o cardápio, mas novos pedidos estão temporariamente bloqueados.</div>}
        {etapa === "itens" ? (
          <>
            <div
              data-lenis-prevent
              className="flex-1 overflow-y-auto p-4 sm:p-5"
            >
              {itens.length === 0 ? (
                <div className="flex min-h-52 flex-col items-center justify-center text-center">
                  <ShoppingBag size={27} className="text-black/25" />
                  <p className="mt-3 text-sm font-semibold">
                    Seu pedido está vazio
                  </p>
                  <p className="mt-1 text-xs text-black/45">
                    Volte ao menu e escolha seus itens.
                  </p>
                </div>
              ) : (
                <div>
                  {itens.map(
                    ({ produto, quantidade, observacoes: observacao }) => (
                      <div
                        key={produto.id}
                        className="grid grid-cols-[76px_1fr_auto] items-start gap-3 border-b border-black/[.08] py-4"
                      >
                        <span
                          className="aspect-square rounded-xl bg-cover"
                          style={fotoDoProduto(produto)}
                        />
                        <span className="min-w-0">
                          <strong className="block truncate font-display text-base">
                            {nomeProdutoExibicao(produto)}
                          </strong>
                          <small className="text-[#0e7775]">
                            {moeda(produto.precoVenda)}
                          </small>
                          <label className="mt-2 block">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.1em] text-black/42">
                              Observação deste item
                            </span>
                            <textarea
                              value={observacao}
                              onChange={(evento) =>
                                onAtualizarObservacao(
                                  produto.id,
                                  evento.target.value,
                                )
                              }
                              placeholder="Ex.: sem cebola"
                              rows={2}
                              maxLength={1000}
                              className="w-full resize-none rounded-xl border border-black/[.09] bg-white/70 px-2.5 py-2 text-xs outline-none transition focus:border-[#0e7775]/45 focus:ring-4 focus:ring-[#0e7775]/10"
                            />
                          </label>
                        </span>
                        <span className="flex items-center rounded-full bg-white p-1">
                          <button
                            onClick={() => ajustar(produto.id, -1)}
                            className="flex h-10 w-10 items-center justify-center rounded-full"
                          >
                            <Minus size={15} />
                          </button>
                          <b className="w-5 text-center text-xs">
                            {quantidade}
                          </b>
                          <button
                            onClick={() => ajustar(produto.id, 1)}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#181714] text-white"
                          >
                            <Plus size={15} />
                          </button>
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
            <footer className="border-t border-black/[.08] bg-[#eee8df] p-5">
              <div className="mb-4 flex items-end justify-between">
                <span className="text-xs text-black/50">Total do pedido</span>
                <strong className="font-display text-2xl text-[#0e7775]">
                  {moeda(totalValor)}
                </strong>
              </div>
              <button
                onClick={() => setEtapa("dados")}
                disabled={!itens.length}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#0e7775] text-sm font-semibold text-white disabled:opacity-35"
              >
                Continuar <ArrowRight size={16} />
              </button>
            </footer>
          </>
        ) : (
          <>
            <div data-lenis-prevent className="flex-1 space-y-4 overflow-y-auto p-5">
              {etapa === "dados" ? (
                <>
              <div
                className="grid grid-cols-2 gap-3"
                aria-label="Forma de recebimento"
              >
                <button
                  onClick={() => setFormaRecebimento("entrega")}
                  aria-pressed={entregaSelecionada}
                  style={
                    entregaSelecionada
                      ? {
                          backgroundColor: "#0e7775",
                          borderColor: "#0e7775",
                          color: "#ffffff",
                        }
                      : undefined
                  }
                  className={`flex min-h-[96px] flex-col items-start justify-center gap-1.5 rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[.98] ${entregaSelecionada ? "shadow-lg shadow-[#0e7775]/20" : "border-black/[.09] bg-white/65 text-black/70 hover:bg-white"}`}
                >
                  <Truck size={20} />
                  <span className="text-sm font-semibold">Entrega</span>
                  <small
                    className={
                      entregaSelecionada ? "text-white/75" : "text-black/45"
                    }
                  >
                    No seu endereço
                  </small>
                </button>
                <button
                  onClick={() => setFormaRecebimento("retirada")}
                  aria-pressed={!entregaSelecionada}
                  style={
                    !entregaSelecionada
                      ? {
                          backgroundColor: "#0e7775",
                          borderColor: "#0e7775",
                          color: "#ffffff",
                        }
                      : undefined
                  }
                  className={`flex min-h-[96px] flex-col items-start justify-center gap-1.5 rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[.98] ${!entregaSelecionada ? "shadow-lg shadow-[#0e7775]/20" : "border-black/[.09] bg-white/65 text-black/70 hover:bg-white"}`}
                >
                  <Store size={20} />
                  <span className="text-sm font-semibold">Retirada</span>
                  <small
                    className={
                      !entregaSelecionada ? "text-white/75" : "text-black/45"
                    }
                  >
                    No estabelecimento
                  </small>
                </button>
              </div>
              <Campo label="Seu nome">
                <input
                  value={nome}
                  onChange={(evento) => setNome(evento.target.value)}
                  placeholder="Como podemos chamar você?"
                  className="menu-field"
                />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="WhatsApp">
                  <input
                    value={telefone}
                    onChange={(evento) => setTelefone(evento.target.value)}
                    placeholder="(00) 00000-0000"
                    className="menu-field"
                  />
                </Campo>
                <Campo label="CPF (opcional)">
                  <input
                    value={cpf}
                    onChange={(evento) => setCpf(evento.target.value)}
                    placeholder="000.000.000-00"
                    className="menu-field"
                  />
                </Campo>
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-black/[.09] bg-white/55 p-3.5">
                <input
                  type="checkbox"
                  checked={notificar}
                  onChange={(evento) => setNotificar(evento.target.checked)}
                  className="h-5 w-5 shrink-0 accent-[#0e7775]"
                />
                <span className="text-xs leading-5 text-black/70">
                  <b className="text-black">Quero ser avisado</b> sobre o
                  andamento deste pedido, aqui e pelo WhatsApp.
                </span>
              </label>
              {entregaSelecionada ? (
                <>
                  <Campo label="Bairro">
                    <select
                      value={bairroId}
                      onChange={(evento) => setBairroId(evento.target.value)}
                      className="menu-field"
                    >
                      <option value="" disabled>
                        Selecione seu bairro
                      </option>
                      {(bairros ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome}{" "}
                          {b.taxa > 0
                            ? `· taxa ${moeda(b.taxa)}`
                            : "· entrega grátis"}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                    <Campo label="Rua ou avenida">
                      <input
                        value={rua}
                        onChange={(evento) => setRua(evento.target.value)}
                        placeholder="Ex.: Rua das Flores"
                        autoComplete="address-line1"
                        className="menu-field"
                      />
                    </Campo>
                    <Campo label="Número">
                      <input
                        value={numeroEndereco}
                        onChange={(evento) => setNumeroEndereco(evento.target.value)}
                        placeholder="123"
                        autoComplete="address-line2"
                        className="menu-field"
                      />
                    </Campo>
                  </div>
                  <Campo label="Complemento (opcional)">
                    <input
                      value={complementoEndereco}
                      onChange={(evento) => setComplementoEndereco(evento.target.value)}
                      placeholder="Ex.: Apt. 202, próximo à praça"
                      autoComplete="address-line2"
                      className="menu-field"
                    />
                  </Campo>
                </>
              ) : (
                <div
                  style={{
                    borderColor: "rgba(14,119,117,.15)",
                    backgroundColor: "rgba(14,119,117,.06)",
                  }}
                  className="flex gap-3 rounded-2xl border p-3 text-xs leading-5 text-black/65"
                >
                  <Store
                    size={17}
                    style={{ color: "#0e7775" }}
                    className="mt-0.5 shrink-0"
                  />
                  Você poderá retirar seu pedido diretamente no estabelecimento.
                </div>
              )}
              {erro && (
                <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs text-red-700">
                  {erro}
                </p>
              )}
            </>
              ) : (
                <>
                  <div className="rounded-2xl border border-coral-100 bg-coral-050 p-3.5 text-sm leading-5 text-black/65">
                    <b className="block text-black">{entregaSelecionada ? "Entrega selecionada" : "Retirada no estabelecimento"}</b>
                    <span>{entregaSelecionada ? `${bairroSelecionado?.nome ?? "Bairro não informado"} · ${enderecoFormatado || "Endereço não informado"}` : "Seu pedido será preparado para retirada."}</span>
                  </div>
                  <Campo label="Como deseja pagar?">
                    <div className="grid grid-cols-2 gap-2">
                      {dados.pix && (
                        <button
                          type="button"
                          aria-pressed={formaPagamento === "pix"}
                          onClick={() => { setFormaPagamento("pix"); setPrecisaTroco(false); }}
                          className={`col-span-2 flex min-h-[76px] items-center gap-3 rounded-2xl border p-3 text-left transition ${formaPagamento === "pix" ? "border-[#0e7775] bg-[#0e7775] text-white shadow-md" : "border-black/[.1] bg-white/65 text-black"}`}
                        >
                          <Banknote size={19} />
                          <span><b className="block text-sm">{dados.pix.modo === "mercado_pago" ? "Pix agora" : "Pix na entrega"}</b><small className={formaPagamento === "pix" ? "text-white/75" : "text-black/50"}>{dados.pix.modo === "mercado_pago" ? "O pedido só vai para a cozinha após a confirmação." : "Pague ao receber seu pedido."}</small></span>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-pressed={formaPagamento === "cartao"}
                        onClick={() => { setFormaPagamento("cartao"); setPrecisaTroco(false); }}
                        className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-3 text-left transition ${formaPagamento === "cartao" ? "border-[#0e7775] bg-[#0e7775] text-white shadow-md" : "border-black/[.1] bg-white/65 text-black"}`}
                      >
                        <CreditCard size={19} /><span className="text-sm font-semibold">Cartão</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={formaPagamento === "dinheiro"}
                        onClick={() => setFormaPagamento("dinheiro")}
                        className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-3 text-left transition ${formaPagamento === "dinheiro" ? "border-[#0e7775] bg-[#0e7775] text-white shadow-md" : "border-black/[.1] bg-white/65 text-black"}`}
                      >
                        <Banknote size={19} /><span className="text-sm font-semibold">Dinheiro</span>
                      </button>
                    </div>
                  </Campo>
                  <button
                    type="button"
                    onClick={() => setDividirPagamento((v) => !v)}
                    className="text-left text-xs font-semibold text-[#0e7775] underline underline-offset-2"
                  >
                    {dividirPagamento ? "Pagar com uma forma só" : "Quero pagar em duas formas"}
                  </button>
                  {!dividirPagamento && formaPagamento === "pix" && dados.pix?.modo === "mercado_pago" && (
                    <Campo label="Seu e-mail para o Pix">
                      <input type="email" autoComplete="email" value={email} onChange={(evento) => setEmail(evento.target.value)} placeholder="voce@exemplo.com" className="menu-field" />
                      <small className="mt-1 block text-xs text-black/45">Usamos esse e-mail apenas para criar a cobrança no Mercado Pago.</small>
                    </Campo>
                  )}
                  {!dividirPagamento && formaPagamento === "pix" && (
                    <div className="rounded-2xl border border-coral-100 bg-coral-050 p-3 text-sm leading-5 text-black/65">
                      {dados.pix?.modo === "mercado_pago" ? "Você receberá um QR Code Pix válido por 30 minutos. A cozinha só receberá a comanda após a confirmação do pagamento." : "O Pix será pago na entrega. A equipe receberá seu pedido agora e confirmará o pagamento depois."}
                    </div>
                  )}
                  {!dividirPagamento && formaPagamento === "cartao" ? (
                    <Campo label="Tipo de cartão">
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setTipoCartao("credito")} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${tipoCartao === "credito" ? "border-coral-500 bg-coral-050 text-coral-600" : "border-black/[.1] bg-white/55 text-black/65"}`}>Crédito</button>
                        <button type="button" onClick={() => setTipoCartao("debito")} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${tipoCartao === "debito" ? "border-coral-500 bg-coral-050 text-coral-600" : "border-black/[.1] bg-white/55 text-black/65"}`}>Débito</button>
                      </div>
                    </Campo>
                  ) : !dividirPagamento && formaPagamento === "dinheiro" ? (
                    <div className="rounded-2xl border border-black/[.09] bg-white/55 p-3">
                      <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-black/75">Precisa de troco?</span><div className="flex rounded-xl bg-black/[.05] p-1"><button type="button" onClick={() => setPrecisaTroco(false)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${!precisaTroco ? "bg-white text-[#0e7775] shadow-sm" : "text-black/50"}`}>Não</button><button type="button" onClick={() => setPrecisaTroco(true)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${precisaTroco ? "bg-white text-[#0e7775] shadow-sm" : "text-black/50"}`}>Sim</button></div></div>
                      {precisaTroco && <label className="mt-3 flex items-center overflow-hidden rounded-xl border border-black/[.1] bg-white"><span className="px-3 text-sm font-semibold text-black/45">R$</span><input inputMode="decimal" value={trocoPara} onChange={(evento) => setTrocoPara(mascararMoeda(evento.target.value))} placeholder="0,00" className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-sm outline-none" /></label>}
                    </div>
                  ) : null}
                  {dividirPagamento && (
                    <div className="space-y-3 rounded-2xl border border-black/[.09] bg-white/55 p-3.5">
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <b className="text-xs font-semibold uppercase tracking-wide text-black/45">1ª forma · {formaPagamento === "cartao" ? "Cartão" : formaPagamento === "pix" ? "Pix" : "Dinheiro"}</b>
                        </div>
                        <label className="flex items-center overflow-hidden rounded-xl border border-black/[.1] bg-white">
                          <span className="px-3 text-sm font-semibold text-black/45">R$</span>
                          <input inputMode="decimal" value={valorParte1} onChange={(evento) => setValorParte1(mascararMoeda(evento.target.value))} placeholder="0,00" className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-sm outline-none" />
                        </label>
                        {formaPagamento === "cartao" && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setTipoCartao("credito")} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${tipoCartao === "credito" ? "border-coral-500 bg-coral-050 text-coral-600" : "border-black/[.1] bg-white/55 text-black/65"}`}>Crédito</button>
                            <button type="button" onClick={() => setTipoCartao("debito")} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${tipoCartao === "debito" ? "border-coral-500 bg-coral-050 text-coral-600" : "border-black/[.1] bg-white/55 text-black/65"}`}>Débito</button>
                          </div>
                        )}
                        {formaPagamento === "dinheiro" && (
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-black/60">Precisa de troco?</span>
                            <div className="flex rounded-xl bg-black/[.05] p-1"><button type="button" onClick={() => setPrecisaTroco(false)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${!precisaTroco ? "bg-white text-[#0e7775] shadow-sm" : "text-black/50"}`}>Não</button><button type="button" onClick={() => setPrecisaTroco(true)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${precisaTroco ? "bg-white text-[#0e7775] shadow-sm" : "text-black/50"}`}>Sim</button></div>
                          </div>
                        )}
                        {formaPagamento === "dinheiro" && precisaTroco && (
                          <label className="mt-2 flex items-center overflow-hidden rounded-xl border border-black/[.1] bg-white"><span className="px-3 text-sm font-semibold text-black/45">Troco p/ R$</span><input inputMode="decimal" value={trocoPara} onChange={(evento) => setTrocoPara(mascararMoeda(evento.target.value))} placeholder="0,00" className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-sm outline-none" /></label>
                        )}
                      </div>
                      <div className="border-t border-black/[.08] pt-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <b className="text-xs font-semibold uppercase tracking-wide text-black/45">2ª forma</b>
                          <div className="flex gap-1.5">
                            {(["cartao", "dinheiro", "pix"] as const).filter((f) => f !== formaPagamento && (f !== "pix" || dados.pix)).map((f) => (
                              <button key={f} type="button" onClick={() => setForma2(f)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${forma2 === f ? "bg-[#0e7775] text-white" : "bg-black/[.05] text-black/55"}`}>{f === "cartao" ? "Cartão" : f === "pix" ? "Pix" : "Dinheiro"}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center overflow-hidden rounded-xl border border-black/[.1] bg-black/[.03]">
                          <span className="px-3 text-sm font-semibold text-black/45">R$</span>
                          <span className="min-w-0 flex-1 py-3 pr-3 text-sm text-black/65">{moeda(valorParte2Numero)}</span>
                        </div>
                        {forma2 === "cartao" && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setTipoCartao2("credito")} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${tipoCartao2 === "credito" ? "border-coral-500 bg-coral-050 text-coral-600" : "border-black/[.1] bg-white/55 text-black/65"}`}>Crédito</button>
                            <button type="button" onClick={() => setTipoCartao2("debito")} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${tipoCartao2 === "debito" ? "border-coral-500 bg-coral-050 text-coral-600" : "border-black/[.1] bg-white/55 text-black/65"}`}>Débito</button>
                          </div>
                        )}
                        {forma2 === "dinheiro" && (
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-black/60">Precisa de troco?</span>
                            <div className="flex rounded-xl bg-black/[.05] p-1"><button type="button" onClick={() => setPrecisaTroco2(false)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${!precisaTroco2 ? "bg-white text-[#0e7775] shadow-sm" : "text-black/50"}`}>Não</button><button type="button" onClick={() => setPrecisaTroco2(true)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${precisaTroco2 ? "bg-white text-[#0e7775] shadow-sm" : "text-black/50"}`}>Sim</button></div>
                          </div>
                        )}
                        {forma2 === "dinheiro" && precisaTroco2 && (
                          <label className="mt-2 flex items-center overflow-hidden rounded-xl border border-black/[.1] bg-white"><span className="px-3 text-sm font-semibold text-black/45">Troco p/ R$</span><input inputMode="decimal" value={trocoPara2} onChange={(evento) => setTrocoPara2(mascararMoeda(evento.target.value))} placeholder="0,00" className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-sm outline-none" /></label>
                        )}
                        {forma2 === "pix" && dados.pix?.modo === "mercado_pago" && (
                          <p className="mt-2 text-xs leading-4 text-black/45">Você receberá um QR Code Pix só desse valor.</p>
                        )}
                      </div>
                      {(usaPixMercadoPagoNaDivisao) && (
                        <Campo label="Seu e-mail para o Pix">
                          <input type="email" autoComplete="email" value={email} onChange={(evento) => setEmail(evento.target.value)} placeholder="voce@exemplo.com" className="menu-field" />
                        </Campo>
                      )}
                    </div>
                  )}
                  <Campo label="Observações do pedido (opcional)">
                    <textarea value={observacoes} onChange={(evento) => setObservacoes(evento.target.value)} placeholder="Ex.: sem cebola ou ponto da carne" rows={3} maxLength={1000} className="menu-field resize-none" />
                  </Campo>
                  <div className="rounded-2xl border border-black/[.08] bg-white/55 p-4">
                    <div className="flex items-center justify-between"><b className="text-sm">Resumo do pedido</b><span className="text-xs text-black/45">{itens.reduce((soma, item) => soma + item.quantidade, 0)} item(ns)</span></div>
                    <div className="mt-3 space-y-2 text-xs text-black/60">{itens.map((item) => <div key={item.produto.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{item.quantidade}× {item.produto.nome}</span><span>{moeda(item.produto.precoVenda * item.quantidade)}</span></div>)}</div>
                  </div>
                  {erro && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs text-red-700">{erro}</p>}
                </>
              )}
            </div>
            <footer className="border-t border-black/[.08] bg-[#eee8df] p-5">
              <div className="mb-4 space-y-1">
                <div className="flex items-end justify-between"><span className="text-xs text-black/50">Subtotal</span><span className="text-sm text-black/60">{moeda(totalValor)}</span></div>
                {entregaSelecionada && <div className="flex items-end justify-between"><span className="text-xs text-black/50">Taxa de entrega</span><span className="text-sm text-black/60">{taxaEntrega > 0 ? moeda(taxaEntrega) : "Grátis"}</span></div>}
                <div className="flex items-end justify-between"><span className="text-xs font-semibold text-black/50">Total</span><strong className="font-display text-2xl text-[#0e7775]">{moeda(totalComTaxa)}</strong></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEtapa(etapa === "dados" ? "itens" : "dados")} className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white" aria-label="Voltar"><ArrowLeft size={18} /></button>
                {etapa === "dados" ? (
                  <button onClick={() => { if (validarDados()) setEtapa("pagamento"); }} className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-[#0e7775] text-sm font-semibold text-white">Continuar para pagamento <ArrowRight size={16} /></button>
                ) : (
                  <button onClick={confirmar} disabled={enviando || !disponivel} className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-[#0e7775] text-sm font-semibold text-white disabled:opacity-50">{enviando ? "Enviando..." : !disponivel ? "Pedidos indisponíveis" : "Confirmar pedido"}<Check size={16} /></button>
                )}
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
/*
                  <button
                    type="button"
                    onClick={() => setFormaPagamento("cartao")}
                    className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-3 text-left transition ${formaPagamento === "cartao" ? "border-[#0e7775] bg-[#0e7775] text-white shadow-md" : "border-black/[.1] bg-white/65 text-black"}`}
                  >
                    <CreditCard size={19} />
                    <span className="text-sm font-semibold">Cartão</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormaPagamento("dinheiro")}
                    className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-3 text-left transition ${formaPagamento === "dinheiro" ? "border-[#0e7775] bg-[#0e7775] text-white shadow-md" : "border-black/[.1] bg-white/65 text-black"}`}
                  >
                    <Banknote size={19} />
                    <span className="text-sm font-semibold">Dinheiro</span>
                  </button>
                </div>
                {formaPagamento === "cartao" ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTipoCartao("credito")}
                      style={
                        tipoCartao === "credito"
                          ? {
                              borderColor: "#0e7775",
                              backgroundColor: "rgba(14,119,117,.1)",
                              color: "#0e7775",
                            }
                          : undefined
                      }
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold ${tipoCartao === "credito" ? "" : "border-black/[.1] bg-white/55 text-black/65"}`}
                    >
                      Crédito
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoCartao("debito")}
                      style={
                        tipoCartao === "debito"
                          ? {
                              borderColor: "#0e7775",
                              backgroundColor: "rgba(14,119,117,.1)",
                              color: "#0e7775",
                            }
                          : undefined
                      }
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold ${tipoCartao === "debito" ? "" : "border-black/[.1] bg-white/55 text-black/65"}`}
                    >
                      Débito
                    </button>
                  </div>
                ) : formaPagamento === "dinheiro" ? (
                  <div className="mt-2 rounded-2xl border border-black/[.09] bg-white/55 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-black/75">
                        Precisa de troco?
                      </span>
                      <div className="flex rounded-xl bg-black/[.05] p-1">
                        <button
                          type="button"
                          onClick={() => setPrecisaTroco(false)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${!precisaTroco ? "bg-white text-[#0e7775] shadow-sm" : "text-black/50"}`}
                        >
                          Não
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrecisaTroco(true)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${precisaTroco ? "bg-white text-[#0e7775] shadow-sm" : "text-black/50"}`}
                        >
                          Sim
                        </button>
                      </div>
                    </div>
                    {precisaTroco && (
                      <label className="mt-3 flex items-center overflow-hidden rounded-xl border border-black/[.1] bg-white">
                        <span className="px-3 text-sm font-semibold text-black/45">
                          R$
                        </span>
                        <input
                          inputMode="decimal"
                          value={trocoPara}
                          onChange={(evento) =>
                            setTrocoPara(mascararMoeda(evento.target.value))
                          }
                          placeholder="0,00"
                          className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-sm outline-none"
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 rounded-2xl border border-coral-100 bg-coral-050 p-3 text-sm leading-5 text-black/65">
                    {dados.pix?.modo === "mercado_pago"
                      ? "Você verá um QR Code Pix válido por 30 minutos. O pedido só seguirá para a cozinha e será impresso depois da confirmação do pagamento."
                      : "O Pix será pago na entrega. A equipe receberá seu pedido agora e confirmará o pagamento depois."}
                  </div>
                )}
              </Campo>
              <Campo label="Observações do pedido (opcional)">
                <textarea
                  value={observacoes}
                  onChange={(evento) => setObservacoes(evento.target.value)}
                  placeholder="Ex.: sem cebola ou ponto da carne"
                  rows={3}
                  maxLength={1000}
                  className="menu-field resize-none"
                />
              </Campo>
              {erro && (
                <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-700">
                  {erro}
                </p>
              )}
            </div>
            <footer className="border-t border-black/[.08] p-5">
              <div className="mb-4 space-y-1">
                <div className="flex items-end justify-between">
                  <span className="text-xs text-black/50">Subtotal</span>
                  <span className="text-sm text-black/60">
                    {moeda(totalValor)}
                  </span>
                </div>
                {entregaSelecionada && (
                  <div className="flex items-end justify-between">
                    <span className="text-xs text-black/50">
                      Taxa de entrega
                    </span>
                    <span className="text-sm text-black/60">
                      {taxaEntrega > 0 ? moeda(taxaEntrega) : "Grátis"}
                    </span>
                  </div>
                )}
                <div className="flex items-end justify-between">
                  <span className="text-xs font-semibold text-black/50">
                    Total
                  </span>
                  <strong className="font-display text-2xl text-[#0e7775]">
                    {moeda(totalComTaxa)}
                  </strong>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEtapa("itens")}
                  className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white"
                  aria-label="Voltar"
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  onClick={confirmar}
                  disabled={enviando}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-[#0e7775] text-sm font-semibold text-white disabled:opacity-50"
                >
                  {enviando ? "Enviando..." : "Confirmar pedido"}
                  <Check size={16} />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
*/

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-black/60">
        {label}
      </span>
      {children}
    </label>
  );
}

function InfoSheet({
  dados,
  onFechar,
}: {
  dados: CardapioData;
  onFechar: () => void;
}) {
  const painelRef = usePainelAcessivel(onFechar);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-6">
      <section ref={painelRef} role="dialog" aria-modal="true" aria-labelledby="informacoes-titulo" tabIndex={-1} className="w-full max-w-lg rounded-t-[2rem] bg-[#eee8df] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none sm:rounded-[2rem] sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#0e7775]">
              Sobre a casa
            </p>
            <h2 id="informacoes-titulo" className="mt-1 font-display text-2xl font-semibold tracking-[-.05em]">
              {dados.nome}
            </h2>
          </div>
          <button
            onClick={onFechar}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-5 text-sm leading-7 text-black/65">
          {dados.tipoComida}. Consulte a equipe para horários, ingredientes,
          alergênicos e condições de entrega.
        </p>
        <div className="mt-6 grid gap-2">
          <button
            onClick={onFechar}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0e7775] text-sm font-semibold text-white"
          >
            <BookOpenText size={16} /> Voltar ao menu
          </button>
          <button className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#181714]">
            <MessageCircle size={16} /> Falar com atendimento
          </button>
        </div>
      </section>
    </div>
  );
}

function TelaSucesso({
  codigo,
  whatsappUrl,
  pagamentoPixConfirmado,
  temAcompanhamento,
  onAcompanhar,
  onNovoPedido,
}: {
  codigo: number | null;
  whatsappUrl: string | null;
  pagamentoPixConfirmado: boolean;
  temAcompanhamento: boolean;
  onAcompanhar: () => void;
  onNovoPedido: () => void;
}) {
  useEffect(() => {
    if (!whatsappUrl) return;
    const temporizador = window.setTimeout(() => {
      window.location.assign(whatsappUrl);
    }, 900);
    return () => window.clearTimeout(temporizador);
  }, [whatsappUrl]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#eee8df] px-6 text-center">
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-[#0e7775] text-white shadow-xl shadow-[#0e7775]/20">
        <Check size={44} strokeWidth={2.2} />
      </span>
      <p className="mt-7 font-display text-3xl font-semibold tracking-[-.055em]">
        {pagamentoPixConfirmado ? "Pagamento confirmado" : "Pedido enviado"}
      </p>
      <p className="mt-3 max-w-sm text-sm leading-6 text-black/55">
        {codigo ? `Seu código é #${codigo}. ` : ""}
        {pagamentoPixConfirmado
          ? "Seu Pix foi aprovado e o pedido já foi enviado para o estabelecimento."
          : "O estabelecimento recebeu seu pedido e dará andamento em instantes."}
      </p>
      {whatsappUrl ? (
        <>
          <p className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-[#0e7775]">
            <MessageCircle size={15} /> Abrindo WhatsApp...
          </p>
          <a
            href={whatsappUrl}
            className="mt-4 flex min-h-12 items-center gap-2 rounded-full bg-[#0e7775] px-6 text-sm font-semibold text-white"
          >
            <MessageCircle size={16} /> Abrir WhatsApp agora
          </a>
        </>
      ) : (
        <p className="mt-3 max-w-sm text-xs leading-5 text-black/45">
          O WhatsApp deste estabelecimento ainda não foi configurado.
        </p>
      )}
      {temAcompanhamento && (
        <button
          onClick={onAcompanhar}
          className="mt-3 flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#181714] shadow-sm"
        >
          <Sparkles size={16} className="text-[#0e7775]" /> Acompanhar meu
          pedido
        </button>
      )}
      <button
        onClick={onNovoPedido}
        className="mt-4 flex min-h-12 items-center gap-2 rounded-full bg-[#181714] px-6 text-sm font-semibold text-white"
      >
        <ArrowLeft size={16} /> Voltar ao menu
      </button>
    </div>
  );
}

function TelaPix({
  slug,
  cobranca,
  onPago,
  onFechar,
}: {
  slug: string;
  cobranca: CobrancaPix;
  onPago: () => void;
  onFechar: () => void;
}) {
  const painelRef = usePainelAcessivel(onFechar);
  const urlStatus = `/api/publico/${slug}/pedidos/${cobranca.pedidoId}`;
  const { dados } = usePolling<PedidoStatusPublico>(
    urlStatus,
    3000,
  );
  const [copiado, setCopiado] = useState(false);
  const expirado = dados?.pagamentoStatus === "falhou";

  useEffect(() => {
    if (dados?.pagamentoStatus === "pago") onPago();
  }, [dados?.pagamentoStatus, onPago]);

  useEffect(() => {
    // O webhook é a confirmação principal. Esta consulta espaçada cobre uma
    // indisponibilidade ou atraso pontual do webhook sem sobrecarregar a API
    // do Mercado Pago enquanto o cliente deixa o QR Code aberto.
    const sincronizar = () => {
      void fetch(`${urlStatus}?sincronizarPix=1`, { cache: "no-store" });
    };
    sincronizar();
    const intervalo = window.setInterval(sincronizar, 12_000);
    return () => window.clearInterval(intervalo);
  }, [urlStatus]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(cobranca.copiaCola);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm sm:p-6">
      <section ref={painelRef} role="dialog" aria-modal="true" aria-labelledby="pix-titulo" tabIndex={-1} className="w-full max-w-md overflow-hidden rounded-[2rem] bg-[#eee8df] shadow-2xl outline-none">
        <header className="flex items-start justify-between border-b border-black/[.08] p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#0e7775]">
              Pix automático
            </p>
            <h2 id="pix-titulo" className="mt-1 font-display text-2xl font-semibold tracking-[-.05em]">
              Pague para enviar o pedido
            </h2>
          </div>
          <button
            onClick={onFechar}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>
        <div className="space-y-4 p-5 text-center">
          {expirado ? (
            <div className="rounded-2xl bg-red-500/10 p-5 text-sm leading-6 text-red-800">
              <b className="block">Este Pix expirou.</b>
              <span>
                Volte ao cardápio e faça o pedido novamente para gerar outra
                cobrança.
              </span>
            </div>
          ) : (
            <>
              <p className="text-sm leading-6 text-black/60">
                Pedido #{cobranca.codigo}. Este QR Code é válido por 30
                minutos. A cozinha não recebe a comanda e nada é impresso
                antes da confirmação do pagamento.
              </p>
              <img
                src={`data:image/png;base64,${cobranca.qrCodeBase64}`}
                alt="QR Code Pix"
                className="mx-auto h-52 w-52 rounded-2xl bg-white p-3 shadow-sm"
              />
              <button
                onClick={copiar}
                className="w-full rounded-xl border border-[#0e7775]/20 bg-white px-4 py-3 text-left text-xs font-medium text-black/65"
              >
                <span className="block truncate">{cobranca.copiaCola}</span>
                <b className="mt-2 block text-[#0e7775]">
                  {copiado ? "Código Pix copiado" : "Copiar Pix Copia e Cola"}
                </b>
              </button>
              <p className="text-xs text-black/45">
                Aguardando a confirmação segura do Mercado Pago. Após a
                confirmação, seu pedido será enviado automaticamente.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

interface AdicionalPublico {
  id: string;
  codigo: number;
  status: PedidoStatusPublico["status"];
  createdAt: string;
  itens: { produtoNome: string; quantidade: number }[];
}

interface PedidoStatusPublico {
  codigo: number;
  status:
    | "novo"
    | "em_preparo"
    | "pronto"
    | "saiu_para_entrega"
    | "finalizado"
    | "cancelado";
  formaRecebimento: "entrega" | "retirada" | null;
  pagamentoStatus?: "pendente" | "pago" | "falhou" | "estornado";
  notificadoMensagem: string | null;
  itens: { produtoNome: string; quantidade: number }[];
  adicionais?: AdicionalPublico[];
}

// "Já saiu pra entrega" (ou, na retirada, "já ficou pronto") é o corte: a
// partir daí o pedido pode estar a caminho ou já nas mãos do cliente, então
// não faz mais sentido lançar itens novos como se fossem chegar junto.
function podeAdicionarItens(
  status: PedidoStatusPublico["status"],
  formaRecebimento: PedidoStatusPublico["formaRecebimento"],
) {
  if (status === "finalizado" || status === "cancelado") return false;
  if (formaRecebimento === "entrega" && status === "saiu_para_entrega") return false;
  if (formaRecebimento === "retirada" && status === "pronto") return false;
  return true;
}

const ETAPAS_PEDIDO: {
  status: PedidoStatusPublico["status"];
  label: string;
  icon: typeof Bell;
}[] = [
  { status: "novo", label: "Recebido", icon: Bell },
  { status: "em_preparo", label: "Em preparo", icon: ChefHat },
  { status: "pronto", label: "Pronto", icon: PackageCheck },
  { status: "saiu_para_entrega", label: "Saiu p/ entrega", icon: Truck },
  { status: "finalizado", label: "Entregue", icon: Check },
];

function PedidoSheet({
  slug,
  pedidoId,
  produtos,
  numeroWhatsapp,
  onFechar,
}: {
  slug: string;
  pedidoId: string;
  produtos: ProdutoPublico[];
  numeroWhatsapp: string;
  onFechar: () => void;
}) {
  const painelRef = usePainelAcessivel(onFechar);
  const { dados, recarregar } = usePolling<PedidoStatusPublico>(
    `/api/publico/${slug}/pedidos/${pedidoId}`,
    3000,
  );
  const statusAnteriorRef = useRef<PedidoStatusPublico["status"] | null>(null);
  const [avisoStatus, setAvisoStatus] = useState<string | null>(null);
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [buscaAdicional, setBuscaAdicional] = useState("");
  const [itensAdicionar, setItensAdicionar] = useState<Record<string, number>>({});
  const [obsAdicional, setObsAdicional] = useState("");
  const [enviandoAdicional, setEnviandoAdicional] = useState(false);
  const [erroAdicional, setErroAdicional] = useState("");

  function ajustarAdicional(produtoId: string, delta: number) {
    setItensAdicionar((atual) => {
      const proximaQtd = (atual[produtoId] ?? 0) + delta;
      const proximo = { ...atual };
      if (proximaQtd <= 0) delete proximo[produtoId];
      else proximo[produtoId] = proximaQtd;
      return proximo;
    });
  }

  const totalItensAdicionar = Object.values(itensAdicionar).reduce((soma, qtd) => soma + qtd, 0);

  async function enviarAdicional() {
    if (totalItensAdicionar === 0) return;
    setEnviandoAdicional(true);
    setErroAdicional("");
    const resposta = await fetch(`/api/publico/${slug}/pedidos/${pedidoId}/itens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: Object.entries(itensAdicionar).map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
        observacoes: obsAdicional.trim() || undefined,
      }),
    });
    setEnviandoAdicional(false);
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null);
      setErroAdicional(corpo?.erro ?? "Não foi possível adicionar os itens.");
      return;
    }
    setItensAdicionar({});
    setObsAdicional("");
    setBuscaAdicional("");
    setAdicionarAberto(false);
    void recarregar();
  }

  const linkWhatsappAdicional = numeroWhatsapp && dados
    ? `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(`Olá! Preciso adicionar algo ao meu pedido #${dados.codigo}.`)}`
    : null;

  useEffect(() => {
    if (!dados) return;
    const statusAnterior = statusAnteriorRef.current;
    statusAnteriorRef.current = dados.status;
    if (!statusAnterior || statusAnterior === dados.status) return;
    const etapa = ETAPAS_PEDIDO.find((item) => item.status === dados.status);
    setAvisoStatus(`Seu pedido agora está: ${etapa?.label ?? dados.status}.`);
  }, [dados?.status, dados]);

  useEffect(() => {
    const sincronizarAoVoltar = () => {
      if (document.visibilityState === "visible") void recarregar();
    };
    window.addEventListener("focus", sincronizarAoVoltar);
    document.addEventListener("visibilitychange", sincronizarAoVoltar);
    return () => {
      window.removeEventListener("focus", sincronizarAoVoltar);
      document.removeEventListener("visibilitychange", sincronizarAoVoltar);
    };
  }, [recarregar]);

  useEffect(() => {
    if (!avisoStatus) return;
    const id = window.setTimeout(() => setAvisoStatus(null), 6000);
    return () => window.clearTimeout(id);
  }, [avisoStatus]);
  const etapas =
    dados?.formaRecebimento === "retirada"
      ? ETAPAS_PEDIDO.filter((e) => e.status !== "saiu_para_entrega")
      : ETAPAS_PEDIDO;
  const indiceAtual = dados
    ? etapas.findIndex((e) => e.status === dados.status)
    : -1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-6">
      <section ref={painelRef} role="dialog" aria-modal="true" aria-labelledby="pedido-titulo" tabIndex={-1} className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-[#eee8df] shadow-2xl outline-none sm:rounded-[2rem]">
        <header className="flex items-center justify-between border-b border-black/[.08] p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#0e7775]">
              Meus pedidos
            </p>
            <h2 id="pedido-titulo" className="mt-1 font-display text-2xl font-semibold tracking-[-.05em]">
              {dados ? `Pedido #${dados.codigo}` : "Acompanhando..."}
            </h2>
          </div>
          <button
            onClick={onFechar}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/70"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <div data-lenis-prevent className="flex-1 overflow-y-auto p-5">
          {!dados ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-center text-black/40">
              <PackageSearch size={26} />
              <p className="mt-3 text-sm font-medium">Carregando status...</p>
            </div>
          ) : dados.status === "cancelado" ? (
            <div className="rounded-2xl bg-white/60 p-6 text-center">
              <p className="font-display text-lg font-semibold text-black/70">
                Pedido cancelado
              </p>
              <p className="mt-2 text-sm text-black/45">
                Fale com o estabelecimento se isso não era esperado.
              </p>
            </div>
          ) : (
            <>
              {avisoStatus && (
                <div role="status" aria-live="polite" className="mb-5 flex items-center gap-3 rounded-2xl border border-[#0e7775]/15 bg-[#0e7775]/10 p-4 text-sm font-medium text-[#0e7775]">
                  <Sparkles size={17} className="shrink-0" />
                  {avisoStatus}
                </div>
              )}
              {dados.notificadoMensagem && (
                <div className="mb-6 flex items-start gap-3 rounded-2xl bg-[#0e7775] p-4 text-white shadow-lg shadow-[#0e7775]/20">
                  <MessageCircle size={17} className="mt-0.5 shrink-0" />
                  <p className="text-sm leading-6">
                    {dados.notificadoMensagem}
                  </p>
                </div>
              )}
              <ol>
                {etapas.map((etapa, i) => {
                  const alcancado = i <= indiceAtual;
                  const atual = i === indiceAtual;
                  const Icon = etapa.icon;
                  return (
                    <li
                      key={etapa.status}
                      className="relative flex gap-4 pb-8 last:pb-0"
                    >
                      {i < etapas.length - 1 && (
                        <span
                          className={`absolute left-[19px] top-10 h-full w-[3px] rounded-full transition-colors duration-500 ${i < indiceAtual ? "bg-[#0e7775]" : "bg-black/[.08]"}`}
                        />
                      )}
                      <span
                        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-500 ${alcancado ? "bg-[#0e7775] text-white shadow-lg shadow-[#0e7775]/25" : "bg-white text-black/25"} ${atual ? "ring-4 ring-[#0e7775]/20" : ""}`}
                      >
                        <Icon size={17} />
                      </span>
                      <div className="pt-2">
                        <p
                          className={`text-sm font-semibold transition-colors ${alcancado ? "text-black/85" : "text-black/35"}`}
                        >
                          {etapa.label}
                        </p>
                        {atual && (
                          <p className="mt-0.5 text-xs font-medium text-[#0e7775]">
                            Agora
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-2 rounded-2xl border border-black/[.08] bg-white/50 p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-black/40">
                  Itens
                </p>
                <ul className="space-y-1.5">
                  {dados.itens.map((item, i) => (
                    <li key={i} className="text-sm text-black/70">
                      <b className="mr-1.5 text-black">{item.quantidade}×</b>
                      {item.produtoNome}
                    </li>
                  ))}
                </ul>
              </div>

              {(dados.adicionais ?? []).map((adicional) => (
                <div key={adicional.id} className="mt-3 rounded-2xl border border-[#0e7775]/15 bg-[#0e7775]/[.05] p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#0e7775]">
                      Adicional · Pedido #{adicional.codigo}
                    </p>
                    <span className="text-[10px] font-semibold text-black/40">
                      {ETAPAS_PEDIDO.find((etapa) => etapa.status === adicional.status)?.label ?? adicional.status}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {adicional.itens.map((item, i) => (
                      <li key={i} className="text-sm text-black/70">
                        <b className="mr-1.5 text-black">{item.quantidade}×</b>
                        {item.produtoNome}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="mt-4">
                {podeAdicionarItens(dados.status, dados.formaRecebimento) ? (
                  !adicionarAberto ? (
                    <button
                      type="button"
                      onClick={() => setAdicionarAberto(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#0e7775]/40 bg-[#0e7775]/5 py-3.5 text-sm font-semibold text-[#0e7775] transition active:scale-[.98]"
                    >
                      <Plus size={16} /> Adicionar mais itens a este pedido
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-black/[.08] bg-white/60 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <b className="text-sm">Adicionar itens</b>
                        <button
                          type="button"
                          onClick={() => { setAdicionarAberto(false); setItensAdicionar({}); setErroAdicional(""); setBuscaAdicional(""); }}
                          className="text-xs font-semibold text-black/40"
                        >
                          Cancelar
                        </button>
                      </div>
                      <div className="relative mb-3">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
                        <input
                          value={buscaAdicional}
                          onChange={(evento) => setBuscaAdicional(evento.target.value)}
                          placeholder="Buscar item do cardápio"
                          className="menu-field pl-9 text-sm"
                        />
                      </div>
                      <div className="max-h-56 space-y-2 overflow-y-auto">
                        {produtos
                          .filter((produto) => nomeProdutoExibicao(produto).toLowerCase().includes(buscaAdicional.toLowerCase()))
                          .slice(0, 20)
                          .map((produto) => {
                            const qtd = itensAdicionar[produto.id] ?? 0;
                            return (
                              <div
                                key={produto.id}
                                className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${qtd > 0 ? "border-[#0e7775]/40 bg-[#0e7775]/5" : "border-black/[.06] bg-white"}`}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium text-black/80">{nomeProdutoExibicao(produto)}</p>
                                  <p className="text-[11px] text-black/45">{moeda(produto.precoVenda)}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <button type="button" onClick={() => ajustarAdicional(produto.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[.05]" aria-label={`Remover ${produto.nome}`}>
                                    <Minus size={13} />
                                  </button>
                                  <span className="w-4 text-center text-xs font-bold">{qtd}</span>
                                  <button type="button" onClick={() => ajustarAdicional(produto.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#181714] text-white" aria-label={`Adicionar ${produto.nome}`}>
                                    <Plus size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      {erroAdicional && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{erroAdicional}</p>}
                      <button
                        type="button"
                        onClick={enviarAdicional}
                        disabled={totalItensAdicionar === 0 || enviandoAdicional}
                        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0e7775] text-sm font-semibold text-white transition active:scale-[.98] disabled:opacity-50"
                      >
                        {enviandoAdicional ? "Enviando..." : totalItensAdicionar > 0 ? `Enviar ${totalItensAdicionar} item(ns) adicional(is)` : "Escolha ao menos 1 item"}
                      </button>
                      <p className="mt-2 text-center text-[11px] text-black/40">Esse valor é cobrado junto na entrega/retirada.</p>
                    </div>
                  )
                ) : (
                  <div className="rounded-2xl border border-black/[.08] bg-white/50 p-3.5 text-xs leading-5 text-black/50">
                    {dados.formaRecebimento === "entrega"
                      ? "Seu pedido já saiu para entrega — não é mais possível adicionar itens."
                      : dados.formaRecebimento === "retirada"
                        ? "Seu pedido já está pronto para retirada — não é mais possível adicionar itens."
                        : "Não é mais possível adicionar itens a este pedido."}
                    {linkWhatsappAdicional && (
                      <a href={linkWhatsappAdicional} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#0e7775]">
                        <MessageCircle size={13} /> Falar com o estabelecimento
                      </a>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function CardapioSkeleton() {
  return (
    <div className="cardapio-theme min-h-dvh bg-[#eee8df] p-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between py-4">
          <i className="of-skeleton h-12 w-12 rounded-full" />
          <i className="of-skeleton h-6 w-20 rounded-lg" />
          <i className="of-skeleton h-12 w-12 rounded-full" />
        </div>
        <i className="of-skeleton block aspect-[16/9] rounded-[1.5rem]" />
        <i className="of-skeleton mx-auto -mt-10 block h-24 w-24 rounded-full ring-8 ring-[#eee8df]" />
        <i className="of-skeleton mx-auto mt-5 block h-7 w-48 rounded-lg" />
        <div className="mt-12 space-y-4">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="flex gap-4 border-b border-black/[.06] pb-5"
            >
              <i className="of-skeleton h-28 w-28 rounded-2xl" />
              <span className="flex-1 space-y-3 py-2">
                <i className="of-skeleton block h-5 w-3/4 rounded" />
                <i className="of-skeleton block h-4 w-20 rounded" />
                <i className="of-skeleton block h-3 w-full rounded" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EstadoErro() {
  return (
    <div className="cardapio-theme flex min-h-dvh items-center justify-center bg-[#eee8df] px-6 text-center">
      <div>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-black/40">
          <CircleHelp size={24} />
        </span>
        <p className="mt-4 font-display text-xl font-semibold">
          Cardápio não encontrado
        </p>
        <p className="mt-2 text-sm text-black/45">
          Confira o link ou tente novamente mais tarde.
        </p>
      </div>
    </div>
  );
}
