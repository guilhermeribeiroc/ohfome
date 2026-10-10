import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacidade | OhFome",
  description: "Como o OhFome usa dados para operar pedidos e a gestão do restaurante, e como solicitar informações.",
};

const emailPrivacidade = process.env.PRIVACY_CONTACT_EMAIL?.trim();
const emailValido = emailPrivacidade && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPrivacidade)
  ? emailPrivacidade
  : null;

export default function PrivacidadePage() {
  return (
    <main className="min-h-dvh bg-cream-50 px-5 py-12 text-ink-900 sm:px-8 sm:py-20">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-coral-600">
          <ArrowLeft size={16} /> Voltar ao OhFome
        </Link>

        <header className="mt-10 border-b border-cream-200 pb-8 sm:mt-14">
          <span className="inline-flex items-center gap-2 rounded-full bg-basil-050 px-3 py-1.5 text-xs font-semibold text-basil-600">
            <ShieldCheck size={14} /> Privacidade e dados
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-[-.045em] sm:text-5xl">Seus dados, com contexto.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-600">
            Esta página explica, em linguagem direta, quais informações podem passar pelo OhFome e a quem recorrer em cada caso. O restaurante decide como atende seus clientes; o OhFome fornece a ferramenta de gestão.
          </p>
          <p className="mt-3 text-xs text-ink-400">Informação atualizada em 10 de outubro de 2026.</p>
        </header>

        <div className="divide-y divide-cream-200">
          <section className="py-8">
            <h2 className="font-display text-xl font-semibold">Quando você faz um pedido</h2>
            <p className="mt-3 text-sm leading-7 text-ink-600">
              O restaurante pode registrar nome, telefone, endereço de entrega, observações do pedido e, quando informados, e-mail ou CPF. Essas informações são usadas para receber, preparar, entregar e acompanhar o pedido. O restaurante acessa os dados da própria operação por meio do sistema.
            </p>
            <p className="mt-3 text-sm leading-7 text-ink-600">
              Se o restaurante habilitar Pix automático, os dados necessários à cobrança também são enviados ao Mercado Pago. O OhFome não recebe nem armazena número ou código de segurança de cartão.
            </p>
          </section>

          <section className="py-8">
            <h2 className="font-display text-xl font-semibold">Quando você usa a gestão do OhFome</h2>
            <p className="mt-3 text-sm leading-7 text-ink-600">
              O sistema processa os dados de acesso da equipe, pedidos, produtos e movimentações do estabelecimento para disponibilizar as funções contratadas. O acesso é separado por estabelecimento e limitado conforme o perfil da conta.
            </p>
          </section>

          <section className="py-8">
            <h2 className="font-display text-xl font-semibold">Como pedir acesso, correção ou exclusão</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-cream-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[.12em] text-coral-600">Dados de um pedido</p>
                <p className="mt-2 text-sm leading-6 text-ink-600">Fale diretamente com o restaurante pelos canais mostrados no cardápio ou na confirmação do pedido. Ele consegue localizar a compra e avaliar a solicitação.</p>
              </div>
              <div className="rounded-2xl border border-cream-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[.12em] text-coral-600">Conta de gestão</p>
                <p className="mt-2 text-sm leading-6 text-ink-600">Peça ajuda ao administrador da conta do restaurante. Para falar com o OhFome sobre uma solicitação de privacidade, use o canal abaixo.</p>
                {emailValido ? (
                  <a href={`mailto:${emailValido}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-900 underline decoration-coral-400 underline-offset-4">
                    <Mail size={15} /> {emailValido}
                  </a>
                ) : (
                  <p className="mt-4 rounded-xl bg-mango-400/15 px-3 py-2 text-xs leading-5 text-ink-600">O contato de privacidade do OhFome será exibido assim que o canal oficial for configurado. Neste meio-tempo, procure o administrador da conta.</p>
                )}
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-ink-600">
              Ao fazer o pedido, evite incluir informações pessoais desnecessárias nas observações. Para conhecer os direitos dos titulares e os canais oficiais, consulte a página da <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares" target="_blank" rel="noreferrer" className="font-semibold text-coral-600 underline underline-offset-4">ANPD</a>.
            </p>
          </section>
        </div>

        <footer className="border-t border-cream-200 pt-6 text-xs leading-6 text-ink-400">
          Este resumo é informativo e não substitui os avisos e condições apresentados pelo restaurante ou pelo responsável pela contratação do OhFome.
        </footer>
      </article>
    </main>
  );
}
