"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Lenis from "@studio-freight/lenis";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  ChevronDown,
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
  banners?: { id: string; url: string; ordem: number }[];
  pix?: { modo: "manual" | "mercado_pago" } | null;
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

function chavePedidoAtivo(slug: string) {
  return `ohfome_pedido_ativo_${slug}`;
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
  const [pedidoAtivo, setPedidoAtivo] = useState<PedidoAtivo | null>(null);
  const [cobrancaPix, setCobrancaPix] = useState<CobrancaPix | null>(null);
  const [indiceBanner, setIndiceBanner] = useState(0);

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

  function ajustar(produtoId: string, delta: number) {
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

  function atualizarObservacaoItem(produtoId: string, observacao: string) {
    setObservacoesItens((atual) => ({
      ...atual,
      [produtoId]: observacao.slice(0, 1000),
    }));
  }

  function abrirProduto(produto: ProdutoPublico) {
    setProdutoSelecionado(produto);
    setOverlay("produto");
  }

  function irParaCategoria(nome: string) {
    const destino = refsCategoria.current[nome];
    if (!destino) return;
    const categoria = categorias.find((item) => item.nome === nome);
    if (categoria) setGrupo(categoria.grupo);
    setCategoriaAtiva(nome);
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
    if (primeiraCategoria) irParaCategoria(primeiraCategoria.nome);
  }

  function abrirMenuLateral() {
    setBuscaAberta(false);
    setOverlay("menu");
  }

  function irParaTopo() {
    setOverlay(null);
    rolarPara(0);
  }

  if (erroCarregar) return <EstadoErro />;
  if (!dados) return <CardapioSkeleton />;

  return (
    <div
      className="cardapio-theme min-h-dvh bg-[#eee8df] pb-28 text-[#181714] lg:pb-24"
      style={{ fontFamily: "var(--font-lexend)" }}
    >
      <header className="mx-auto max-w-4xl px-4 pt-4 sm:px-6 sm:pt-6 lg:max-w-6xl lg:px-8 lg:pt-5">
        <div className="grid grid-cols-[48px_1fr_48px] items-center py-2">
          <button
            onClick={abrirMenuLateral}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/[.035] text-[#181714] transition active:scale-95"
            aria-label="Abrir menu lateral"
          >
            <Menu size={23} strokeWidth={1.8} />
          </button>
          <span className="text-center font-display text-xl font-semibold tracking-[-.04em] sm:text-2xl">
            Menu
          </span>
          <button
            onClick={() => setBuscaAberta((aberta) => !aberta)}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/[.035] text-[#181714] transition active:scale-95"
            aria-label="Buscar no cardápio"
          >
            <Search size={22} strokeWidth={1.8} />
          </button>
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
                        {produto.nome}
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
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
            style={
              bannerAtual && dados.bannerModo !== "padrao"
                ? { backgroundImage: `url(${bannerAtual.url})` }
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
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 text-white sm:p-8">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/60">
                Cardápio digital
              </p>
              <p className="mt-2 max-w-[15rem] font-display text-2xl font-semibold leading-none tracking-[-.055em] sm:max-w-xs sm:text-3xl">
                Seu sabor.
                <br />
                Sua marca.
                <br />
                Seu menu.
              </p>
            </div>
            <span className="mb-1 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.14em] backdrop-blur">
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
            onClick={() => setOverlay("info")}
            className="absolute right-0 top-16 flex min-h-11 items-center gap-2 rounded-full bg-black/[.035] px-4 text-xs font-semibold text-[#0e7775] transition active:scale-95 sm:right-4"
          >
            <Info size={15} /> Info <ArrowRight size={14} />
          </button>
          <h1 className="mt-4 text-center font-display text-2xl font-semibold tracking-[-.055em] sm:text-3xl">
            {dados.nome}
          </h1>
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
        {categorias.map((categoria, indice) => (
          <section
            key={categoria.nome}
            data-categoria={categoria.nome}
            ref={(elemento) => {
              refsCategoria.current[categoria.nome] = elemento;
            }}
            className="scroll-mt-40 pt-9 lg:pt-12"
          >
            {indice > 0 &&
              categoria.grupo !== categorias[indice - 1]?.grupo && (
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.17em] text-black/35">
                  {categoria.grupo}
                </p>
              )}
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
                        {produto.nome}
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
            src="/marca/ohfome-logo.svg"
            alt="OhFome"
            className="mt-4 h-12 w-auto"
          />
          <small className="mt-1 text-[10px] uppercase tracking-[.14em] text-black/35">
            Cardápio digital
          </small>
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[.08] bg-[#eee8df]/97 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl">
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
            onClick={() => setOverlay("carrinho")}
          />
          {pedidoAtivo ? (
            <BottomAction
              label="Meus pedidos"
              icon={PackageSearch}
              destaque
              onClick={() => setOverlay("pedidos")}
            />
          ) : (
            <BottomAction
              label="Atendimento"
              icon={MessageCircle}
              onClick={() => setOverlay("info")}
            />
          )}
          <BottomAction
            label="Info"
            icon={CircleHelp}
            onClick={() => setOverlay("info")}
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
          onFechar={() => setOverlay(null)}
          onAbrirCarrinho={() => setOverlay("carrinho")}
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
          onFechar={() => setOverlay(null)}
          onConfirmado={(codigo, whatsapp, pedidoId) => {
            setCarrinho({});
            setObservacoesItens({});
            setCodigoPedido(codigo);
            setLinkWhatsapp(whatsapp);
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
            setOverlay("sucesso");
          }}
          onAguardandoPix={(cobranca) => {
            setCarrinho({});
            setObservacoesItens({});
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
            setOverlay("pix");
          }}
        />
      )}
      {overlay === "pix" && cobrancaPix && (
        <TelaPix
          slug={slug}
          cobranca={cobrancaPix}
          onPago={() => {
            setCodigoPedido(cobrancaPix.codigo);
            setLinkWhatsapp(null);
            setOverlay("sucesso");
          }}
          onFechar={() => setOverlay("pedidos")}
        />
      )}
      {overlay === "info" && (
        <InfoSheet dados={dados} onFechar={() => setOverlay(null)} />
      )}
      {overlay === "menu" && (
        <MenuLateral
          dados={dados}
          categorias={categorias}
          categoriaAtiva={categoriaAtivaExibida}
          carrinhoItens={totalItens}
          onFechar={() => setOverlay(null)}
          onSelecionar={(nome) => {
            setOverlay(null);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => irParaCategoria(nome)),
            );
          }}
          onAbrirPedido={() => setOverlay("carrinho")}
          onAbrirInfo={() => setOverlay("info")}
        />
      )}
      {overlay === "sucesso" && (
        <TelaSucesso
          codigo={codigoPedido}
          whatsappUrl={linkWhatsapp}
          temAcompanhamento={Boolean(pedidoAtivo)}
          onAcompanhar={() => setOverlay("pedidos")}
          onNovoPedido={() => setOverlay(null)}
        />
      )}
      {overlay === "pedidos" && pedidoAtivo && (
        <PedidoSheet
          slug={slug}
          pedidoId={pedidoAtivo.id}
          onFechar={() => setOverlay(null)}
        />
      )}
    </div>
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
  return (
    <div
      className="fixed inset-0 z-[60] flex bg-black/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Navegação do cardápio"
    >
      <aside className="flex min-h-full w-[min(88vw,360px)] flex-col bg-[#f4eee6] shadow-2xl animate-in slide-in-from-left duration-200">
        <header className="border-b border-black/[.08] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#0e7775]">
                Navegue pelo menu
              </p>
              <h2 className="mt-1 truncate font-display text-2xl font-semibold tracking-[-.055em]">
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

function ProdutoDetalhe({
  produto,
  quantidade,
  observacao,
  ajustar,
  onAtualizarObservacao,
  onFechar,
  onAbrirCarrinho,
}: {
  produto: ProdutoPublico;
  quantidade: number;
  observacao: string;
  ajustar: (id: string, delta: number) => void;
  onAtualizarObservacao: (id: string, observacao: string) => void;
  onFechar: () => void;
  onAbrirCarrinho: () => void;
}) {
  return (
    <div
      data-lenis-prevent
      className="fixed inset-0 z-50 overflow-y-auto bg-[#eee8df] sm:flex sm:items-center sm:justify-center sm:overflow-hidden sm:bg-black/55 sm:p-6 sm:backdrop-blur-sm"
    >
      <article className="relative mx-auto min-h-dvh max-w-3xl overflow-hidden bg-[#eee8df] sm:min-h-0 sm:w-full sm:rounded-[2rem] sm:shadow-2xl lg:grid lg:h-[min(82dvh,42rem)] lg:max-w-5xl lg:grid-cols-[minmax(22rem,.92fr)_minmax(0,1.08fr)] lg:rounded-[2.25rem]">
        <div
          className="relative aspect-[4/3] max-h-[58dvh] bg-cover bg-center lg:h-full lg:max-h-none lg:aspect-auto"
          style={fotoDoProduto(produto)}
        >
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/25 to-transparent" />
          <span className="absolute left-1/2 top-4 h-1.5 w-14 -translate-x-1/2 rounded-full bg-white/75 lg:hidden" />
          <button
            onClick={onFechar}
            className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/65"
            aria-label="Fechar detalhes"
          >
            <ChevronDown size={24} />
          </button>
        </div>
        <div className="p-5 pb-36 sm:p-8 sm:pb-32 lg:max-h-full lg:overflow-y-auto lg:p-9 lg:pb-36">
          <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#0e7775]">
            {produto.categoriaNome}
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold uppercase leading-[1.02] tracking-[-.055em] sm:text-4xl">
            {produto.nome}
          </h2>
          <p className="mt-3 font-display text-2xl font-semibold text-[#0e7775]">
            {moeda(produto.precoVenda)}
          </p>
          <p className="mt-7 text-base leading-7 text-black/70 sm:max-w-2xl sm:text-lg sm:leading-8">
            {descricaoDoProduto(produto)}
          </p>
          <label className="mt-7 block rounded-2xl border border-[#0e7775]/15 bg-[#0e7775]/[.045] p-4">
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
                disabled={quantidade === 0}
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
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#181714] text-white"
                aria-label="Adicionar"
              >
                <Plus size={17} />
              </button>
            </div>
            <button
              onClick={() => {
                if (quantidade === 0) ajustar(produto.id, 1);
                else onAbrirCarrinho();
              }}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-[#0e7775] px-5 text-sm font-semibold text-white shadow-lg shadow-[#0e7775]/20"
            >
              {quantidade === 0 ? "Adicionar ao pedido" : "Ver pedido"}
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
}) {
  const [etapa, setEtapa] = useState<"itens" | "dados">("itens");
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
  const [endereco, setEndereco] = useState("");
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

  async function confirmar() {
    if (!nome.trim() || telefone.trim().length < 8) {
      setErro("Preencha seu nome e WhatsApp.");
      return;
    }
    if (entregaSelecionada && !bairroId) {
      setErro("Selecione o bairro de entrega.");
      return;
    }
    if (entregaSelecionada && endereco.trim().length < 10) {
      setErro("Informe o endereço completo para entrega.");
      return;
    }
    const emailPagador = email.trim();
    if (
      formaPagamento === "pix" &&
      dados.pix?.modo === "mercado_pago" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPagador)
    ) {
      setErro("Informe um e-mail válido para gerar o Pix.");
      return;
    }
    if (
      formaPagamento === "dinheiro" &&
      precisaTroco &&
      numeroDaMoeda(trocoPara) <= 0
    ) {
      setErro("Informe o valor para o qual precisa de troco.");
      return;
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
        endereco,
        bairroId: entregaSelecionada ? bairroId : undefined,
        formaPagamento,
        tipoCartao: formaPagamento === "cartao" ? tipoCartao : null,
        trocoPara:
          formaPagamento === "dinheiro" && precisaTroco
            ? numeroDaMoeda(trocoPara)
            : null,
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
    const pagamento =
      formaPagamento === "cartao"
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
      formaPagamento === "dinheiro" && precisaTroco
        ? `*Troco para:* ${moeda(numeroDaMoeda(trocoPara))}`
        : "",
      entregaSelecionada ? `*Bairro:* ${bairroSelecionado?.nome ?? ""}` : "",
      entregaSelecionada ? `*Endereço:* ${endereco.trim()}` : "",
      entregaSelecionada && taxaEntrega > 0
        ? `*Taxa de entrega:* ${moeda(taxaEntrega)}`
        : "",
      observacoes.trim() ? `*Observações gerais:* ${observacoes.trim()}` : "",
      "",
      "*Itens:*",
      ...itens.map(
        (item) =>
          `${item.quantidade}× ${item.produto.nome} — ${moeda(item.produto.precoVenda * item.quantidade)}${item.observacoes ? `\n   Obs.: ${item.observacoes}` : ""}`,
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
      <section className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-[#eee8df] shadow-2xl sm:rounded-[2rem]">
        <header className="flex items-center justify-between border-b border-black/[.08] p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#0e7775]">
              Seu pedido
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-.05em]">
              {etapa === "itens"
                ? "Revise sua seleção"
                : "Como você prefere receber?"}
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
                            {produto.nome}
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
            <div
              data-lenis-prevent
              className="flex-1 space-y-4 overflow-y-auto p-5"
            >
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
              {dados.pix && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFormaPagamento("pix");
                      setPrecisaTroco(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${formaPagamento === "pix" ? "border-[#0e7775] bg-[#0e7775] text-white shadow-md" : "border-[#0e7775]/20 bg-[#0e7775]/[.05] text-black"}`}
                  >
                    <Banknote size={19} />
                    <span>
                      <b className="block text-sm">
                        {dados.pix.modo === "mercado_pago"
                          ? "Pix agora"
                          : "Pix na entrega"}
                      </b>
                      <small
                        className={
                          formaPagamento === "pix"
                            ? "text-white/75"
                            : "text-black/55"
                        }
                      >
                        {dados.pix.modo === "mercado_pago"
                          ? "Gera um QR Code e libera o preparo somente depois do pagamento."
                          : "Você paga ao receber; a equipe confirma depois."}
                      </small>
                    </span>
                  </button>
                  {formaPagamento === "pix" &&
                    dados.pix.modo === "mercado_pago" && (
                      <Campo label="Seu e-mail para o Pix">
                        <input
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(evento) => setEmail(evento.target.value)}
                          placeholder="voce@exemplo.com"
                          className="menu-field"
                        />
                        <small className="mt-1 block text-xs text-black/45">
                          O Mercado Pago usa este e-mail para gerar a cobrança.
                        </small>
                      </Campo>
                    )}
                </>
              )}
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
                  <Campo label="Endereço completo">
                    <textarea
                      value={endereco}
                      onChange={(evento) => setEndereco(evento.target.value)}
                      placeholder="Rua, número e complemento"
                      rows={3}
                      className="menu-field resize-none"
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
              <Campo label="Forma de pagamento">
                <div className="grid grid-cols-2 gap-2">
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
                  <div className="mt-2 rounded-2xl border border-[#0e7775]/15 bg-[#0e7775]/[.06] p-3 text-sm leading-5 text-black/65">
                    {dados.pix?.modo === "mercado_pago"
                      ? "Você verá o QR Code Pix na próxima etapa. O pedido seguirá para a cozinha somente depois da confirmação do pagamento."
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
}

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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-6">
      <section className="w-full max-w-lg rounded-t-[2rem] bg-[#eee8df] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[2rem] sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#0e7775]">
              Sobre a casa
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-.05em]">
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
  temAcompanhamento,
  onAcompanhar,
  onNovoPedido,
}: {
  codigo: number | null;
  whatsappUrl: string | null;
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
        Pedido enviado
      </p>
      <p className="mt-3 max-w-sm text-sm leading-6 text-black/55">
        {codigo ? `Seu código é #${codigo}. ` : ""}O estabelecimento recebeu seu
        pedido e dará andamento em instantes.
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
  const { dados } = usePolling<PedidoStatusPublico>(
    `/api/publico/${slug}/pedidos/${cobranca.pedidoId}`,
    3000,
  );
  const [copiado, setCopiado] = useState(false);
  const expirado = dados?.pagamentoStatus === "falhou";

  useEffect(() => {
    if (dados?.pagamentoStatus === "pago") onPago();
  }, [dados?.pagamentoStatus, onPago]);

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
      <section className="w-full max-w-md overflow-hidden rounded-[2rem] bg-[#eee8df] shadow-2xl">
        <header className="flex items-start justify-between border-b border-black/[.08] p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#0e7775]">
              Pix automático
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-.05em]">
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
                Pedido #{cobranca.codigo}. A cozinha receberá a comanda
                automaticamente após o pagamento confirmado.
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
                Aguardando a confirmação segura do Mercado Pago…
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
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
  onFechar,
}: {
  slug: string;
  pedidoId: string;
  onFechar: () => void;
}) {
  const { dados } = usePolling<PedidoStatusPublico>(
    `/api/publico/${slug}/pedidos/${pedidoId}`,
    5000,
  );
  const etapas =
    dados?.formaRecebimento === "retirada"
      ? ETAPAS_PEDIDO.filter((e) => e.status !== "saiu_para_entrega")
      : ETAPAS_PEDIDO;
  const indiceAtual = dados
    ? etapas.findIndex((e) => e.status === dados.status)
    : -1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-6">
      <section className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-[#eee8df] shadow-2xl sm:rounded-[2rem]">
        <header className="flex items-center justify-between border-b border-black/[.08] p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#0e7775]">
              Meus pedidos
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-.05em]">
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
