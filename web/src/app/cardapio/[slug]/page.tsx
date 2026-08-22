import type { Metadata } from "next";
import { CardapioPublico } from "@/components/cardapio-publico/CardapioPublico";
import { queryPublico } from "@/lib/db";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const linhas = await queryPublico<{ fn_cardapio_publico: { nome?: string } | null }>(
    "select fn_cardapio_publico($1)",
    [slug]
  );
  const nome = linhas[0]?.fn_cardapio_publico?.nome;
  return { title: nome ? `${nome} | Cardápio digital` : "Cardápio digital | OhFome" };
}

export default async function CardapioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CardapioPublico slug={slug} />;
}
