// Liga o NOME DO ARQUIVO da foto a um produto/sabor do cardápio (ex.: "x-bacon.jpg" -> X-Bacon).

export interface ItemParaFoto { chave: string; nome: string; categoria: string }

const IGNORAR = new Set(["de", "da", "do", "das", "dos", "com", "ao", "img", "image", "imagem", "foto", "fotos", "whatsapp", "copia", "copy", "jpeg", "jpg", "png", "webp", "screenshot"]);

function tirarAcentos(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Singular simples: "pizzas" e "pizza" viram a mesma palavra.
function singular(palavra: string) {
  return palavra.length > 3 && palavra.endsWith("s") ? palavra.slice(0, -1) : palavra;
}

export function palavrasDe(texto: string): string[] {
  return tirarAcentos(texto)
    .replace(/\.[a-z0-9]{2,4}$/, "")
    .split(/[^a-z0-9]+/)
    .filter((palavra) => (palavra.length >= 2 || palavra === "x") && !/^\d+$/.test(palavra) && !IGNORAR.has(palavra))
    .map(singular);
}

/**
 * Devolve a chave do item cujo nome está todo contido no nome do arquivo. Em caso de empate (dois itens igualmente
 * bons, como a pizza "Bacon" e o sanduíche "X-Bacon" sem pista no arquivo) devolve null para o dono decidir.
 */
export function casarPorNome(nomeArquivo: string, itens: ItemParaFoto[]): string | null {
  const doArquivo = new Set(palavrasDe(nomeArquivo));
  if (!doArquivo.size) return null;
  let melhor: { chave: string; pontos: number } | null = null;
  let empate = false;
  for (const item of itens) {
    const doItem = palavrasDe(item.nome);
    if (!doItem.length || !doItem.every((palavra) => doArquivo.has(palavra))) continue;
    // Mais palavras do nome batendo vale mais; citar a categoria no arquivo ("pizza-calabresa") desempata.
    const categoriaCitada = palavrasDe(item.categoria).some((palavra) => doArquivo.has(palavra)) ? 1 : 0;
    const pontos = doItem.length * 10 + categoriaCitada;
    if (!melhor || pontos > melhor.pontos) { melhor = { chave: item.chave, pontos }; empate = false; }
    else if (pontos === melhor.pontos) empate = true;
  }
  return melhor && !empate ? melhor.chave : null;
}
