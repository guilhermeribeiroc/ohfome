import { CardapioPublico } from "@/components/cardapio-publico/CardapioPublico";

export default async function CardapioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CardapioPublico slug={slug} />;
}
