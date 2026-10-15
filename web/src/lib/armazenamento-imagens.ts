import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";

const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
type CategoriaImagem = "banners" | "logos" | "produtos";

// Lado maior em pixels depois do redimensionamento — banner ocupa a largura
// cheia do cardapio digital, logo e foto de produto aparecem como miniatura
// (ate 48px nas telas de estoque/pedidos). Fotos de celular chegam a 4000px+
// de lado; sem isso, o navegador baixa e decodifica o arquivo inteiro so pra
// desenhar um quadrado de 44px, o que pesa em PC fraco de restaurante.
const DIMENSAO_MAXIMA: Record<CategoriaImagem, number> = {
  banners: 1600,
  produtos: 1000,
  logos: 800,
};

// Mantem o formato original (jpg continua jpg, png continua png) de proposito
// — converter tudo pra WebP economizaria mais bytes, mas mudaria a extensao
// do arquivo, e a URL salva em produtos.imagem_url/banners_cardapio.url/
// estabelecimentos.logo_url embute essa extensao. Reencodar no mesmo formato
// evita qualquer migracao de dados: mesmo nome de arquivo, mesma URL, so que
// menor. sharp descarta EXIF/ICC por padrao (so preserva se .withMetadata()
// for chamado), entao o metadado ja sai sem passo extra.
async function redimensionarEComprimir(bytes: Buffer, tipo: string, dimensaoMaxima: number): Promise<Buffer> {
  const imagem = sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ width: dimensaoMaxima, height: dimensaoMaxima, fit: "inside", withoutEnlargement: true });
  if (tipo === "image/jpeg") return imagem.jpeg({ quality: 78 }).toBuffer();
  if (tipo === "image/webp") return imagem.webp({ quality: 78 }).toBuffer();
  return imagem.png({ compressionLevel: 9 }).toBuffer();
}

function tipoRealDaImagem(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function raizUploads() {
  return process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "public", "uploads");
}

export async function salvarImagem(categoria: CategoriaImagem, arquivo: File) {
  const extensao = TIPOS_PERMITIDOS[arquivo.type];
  if (!extensao) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  if (arquivo.size > LIMITE_IMAGEM_BYTES) throw new Error("A imagem deve ter no máximo 5 MB.");
  const bytesOriginais = Buffer.from(await arquivo.arrayBuffer());
  const tipoReal = tipoRealDaImagem(bytesOriginais);
  if (tipoReal !== arquivo.type) throw new Error("O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WebP válida.");

  let bytes: Buffer<ArrayBufferLike> = bytesOriginais;
  try {
    bytes = await redimensionarEComprimir(bytesOriginais, tipoReal, DIMENSAO_MAXIMA[categoria]);
  } catch {
    // Se a compressao falhar por qualquer motivo (arquivo exotico que passou
    // na checagem de magic bytes, limite de memoria etc.), salva o original
    // em vez de quebrar o upload — melhor uma imagem pesada do que nenhuma.
  }

  const nome = `${randomUUID()}.${extensao}`;
  const pasta = path.join(raizUploads(), categoria);
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, nome), bytes);
  return { nome, url: `/api/arquivos/${categoria}/${nome}` };
}

export async function lerImagemPublica(categoria: CategoriaImagem, nome: string) {
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(nome)) return null;
  try {
    return await readFile(path.join(raizUploads(), categoria, nome));
  } catch {
    return null;
  }
}

export function tipoImagem(nome: string) {
  if (nome.endsWith(".png")) return "image/png";
  if (nome.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
