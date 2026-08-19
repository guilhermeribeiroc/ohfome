import { AcompanhamentoPedido } from "@/components/cardapio-publico/AcompanhamentoPedido";

export default async function AcompanhamentoPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return <AcompanhamentoPedido slug={slug} pedidoId={id} />;
}
