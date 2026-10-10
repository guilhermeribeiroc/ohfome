import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
type CategoriaImagem = "banners" | "logos" | "produtos";

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
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (tipoRealDaImagem(bytes) !== arquivo.type) throw new Error("O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WebP válida.");
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
