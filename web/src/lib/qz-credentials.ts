function normalizar(valor: string | undefined) {
  return valor?.replace(/\\n/g, "\n").trim() || null;
}

/**
 * Os valores Base64 evitam que certificados PEM com várias linhas sejam
 * corrompidos por painéis de variáveis de ambiente. Mantém compatibilidade
 * com a configuração PEM antiga durante a migração.
 */
export function credencialQz(nome: "QZ_CERTIFICATE" | "QZ_PRIVATE_KEY") {
  const codificada = process.env[`${nome}_BASE64`];
  if (codificada) {
    try {
      const valor = Buffer.from(codificada, "base64").toString("utf8");
      if (valor.includes("-----BEGIN")) return valor;
    } catch {
      // A resposta abaixo preserva o comportamento de credencial ausente.
    }
  }
  return normalizar(process.env[nome]);
}
