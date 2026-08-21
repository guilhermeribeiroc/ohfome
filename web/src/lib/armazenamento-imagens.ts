import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;

function raizUploads() {
  return process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "public", "uploads");
}

export async function salvarImagem(categoria: "banners" | "logos", arquivo: File) {
  const extensao = TIPOS_PERMITIDOS[arquivo.type];
  if (!extensao) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  if (arquivo.size > LIMITE_IMAGEM_BYTES) throw new Error("A imagem deve ter no máximo 5 MB.");
  const nome = `${randomUUID()}.${extensao}`;
  const pasta = path.join(raizUploads(), categoria);
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, nome), Buffer.from(await arquivo.arrayBuffer()));
  return { nome, url: `/api/arquivos/${categoria}/${nome}` };
}

export async function lerImagemPublica(categoria: "banners" | "logos", nome: string) {
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
