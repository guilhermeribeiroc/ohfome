// Utilitários de foto que rodam no navegador (não importar em código de servidor).

const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"];

export function ehImagemAceita(arquivo: File) {
  return TIPOS_ACEITOS.includes(arquivo.type);
}

/**
 * Reduz a foto antes de enviar: fotos de celular chegam a 5-10 MB e deixariam o cardápio digital lento.
 * Mantém a proporção, limita o maior lado e salva em JPEG.
 */
export async function reduzirImagem(arquivo: File, ladoMaximo = 1280, qualidade = 0.82): Promise<File> {
  if (!ehImagemAceita(arquivo)) throw new Error("Use fotos JPG, PNG ou WebP.");
  const bitmap = await createImageBitmap(arquivo);
  try {
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const contexto = canvas.getContext("2d");
    if (!contexto) throw new Error("Não foi possível preparar a foto.");
    contexto.fillStyle = "#ffffff"; // PNG com fundo transparente vira branco no JPEG
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolver) => canvas.toBlob(resolver, "image/jpeg", qualidade));
    if (!blob) throw new Error("Não foi possível preparar a foto.");
    return new File([blob], `${arquivo.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}
