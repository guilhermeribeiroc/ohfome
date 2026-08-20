import { KanbanBoard } from "@/components/pedidos/KanbanBoard";

export default function CozinhaPage() {
  return (
    <KanbanBoard
        titulo="Cozinha"
        subtitulo="Itens a preparar, em ordem de chegada"
        colunas={["novo", "em_preparo", "pronto"]}
        permiteCriar={false}
        permiteCancelar={false}
        modoCozinha
    />
  );
}
