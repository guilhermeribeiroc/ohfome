// Recomprime as imagens ja enviadas (banners, logos, produtos) no lugar —
// mesmo nome de arquivo, mesmo formato, so que redimensionadas e com
// qualidade reduzida. Nao muda nenhuma URL salva no banco, entao e seguro
// rodar sem migracao de dados. Veja o raciocinio completo em
// src/lib/armazenamento-imagens.ts (redimensionarEComprimir).
//
// Uso: node scripts/comprimir-uploads.mjs [--dir /caminho/dos/uploads] [--dry-run]
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIMENSAO_MAXIMA = { banners: 1600, produtos: 1000, logos: 800 };
const CATEGORIAS = Object.keys(DIMENSAO_MAXIMA);

function tipoPorExtensao(nome) {
  if (nome.endsWith(".jpg") || nome.endsWith(".jpeg")) return "image/jpeg";
  if (nome.endsWith(".png")) return "image/png";
  if (nome.endsWith(".webp")) return "image/webp";
  return null;
}

async function redimensionarEComprimir(bytes, tipo, dimensaoMaxima) {
  const imagem = sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ width: dimensaoMaxima, height: dimensaoMaxima, fit: "inside", withoutEnlargement: true });
  if (tipo === "image/jpeg") return imagem.jpeg({ quality: 78 }).toBuffer();
  if (tipo === "image/webp") return imagem.webp({ quality: 78 }).toBuffer();
  return imagem.png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dirIndex = args.indexOf("--dir");
  const raiz = dirIndex >= 0 ? args[dirIndex + 1] : path.join(process.cwd(), "public", "uploads");

  let totalAntes = 0;
  let totalDepois = 0;
  let processados = 0;
  let pulados = 0;

  for (const categoria of CATEGORIAS) {
    const pasta = path.join(raiz, categoria);
    let arquivos;
    try {
      arquivos = await readdir(pasta);
    } catch {
      continue; // categoria sem nenhum upload ainda
    }

    for (const nome of arquivos) {
      const tipo = tipoPorExtensao(nome);
      if (!tipo) { pulados += 1; continue; }

      const caminho = path.join(pasta, nome);
      const bytesOriginais = await readFile(caminho);
      const tamanhoAntes = bytesOriginais.length;

      let bytesNovos;
      try {
        bytesNovos = await redimensionarEComprimir(bytesOriginais, tipo, DIMENSAO_MAXIMA[categoria]);
      } catch (erro) {
        console.warn(`! falhou ${categoria}/${nome}: ${erro.message} — mantendo original`);
        pulados += 1;
        continue;
      }

      // So sobrescreve se realmente ficou menor — uma imagem ja pequena/
      // simples pode nao compensar o reencode (ex: PNG com poucas cores).
      if (bytesNovos.length >= tamanhoAntes) { pulados += 1; continue; }

      totalAntes += tamanhoAntes;
      totalDepois += bytesNovos.length;
      processados += 1;

      const reducao = (100 * (1 - bytesNovos.length / tamanhoAntes)).toFixed(0);
      console.log(`${dryRun ? "[dry-run] " : ""}${categoria}/${nome}: ${(tamanhoAntes / 1024).toFixed(0)}KB -> ${(bytesNovos.length / 1024).toFixed(0)}KB (-${reducao}%)`);

      if (!dryRun) await writeFile(caminho, bytesNovos);
    }
  }

  console.log(`\n${processados} imagem(ns) recomprimida(s), ${pulados} mantida(s) como estava(m).`);
  if (totalAntes > 0) {
    console.log(`Total: ${(totalAntes / 1024 / 1024).toFixed(2)}MB -> ${(totalDepois / 1024 / 1024).toFixed(2)}MB`);
  }
  if (dryRun) console.log("Nenhum arquivo foi alterado (--dry-run).");
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
