const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);
export const EXEMPLO_CELULAR = "(88) 99999-1234";

type Celular = { ok: true; local: string } | { ok: false; erro: string };

// Aceita o celular com ou sem máscara, com ou sem 55, e devolve DDD + 9 dígitos (11 dígitos).
function validarCelular(entrada: string): Celular {
  let digitos = entrada.replace(/\D/g, "").replace(/^0+/, "");
  if (digitos.startsWith("55") && digitos.length >= 12) digitos = digitos.slice(2);
  if (digitos.length < 10 || digitos.length > 11) {
    return { ok: false, erro: `Informe o celular com DDD. Ex.: ${EXEMPLO_CELULAR}.` };
  }
  if (!DDDS_VALIDOS.has(Number(digitos.slice(0, 2)))) {
    return { ok: false, erro: `O DDD ${digitos.slice(0, 2)} não existe. Confira o número. Ex.: ${EXEMPLO_CELULAR}.` };
  }
  const assinante = digitos.slice(2);
  if (assinante.length === 8) {
    return /^[2-5]/.test(assinante)
      ? { ok: false, erro: "Esse parece ser um telefone fixo, que não recebe WhatsApp. Informe o celular (9 dígitos, começando com 9)." }
      : { ok: false, erro: "Falta o 9 do celular. O número deve ter 9 dígitos e começar com 9." };
  }
  if (assinante[0] !== "9") return { ok: false, erro: "O celular deve começar com 9 depois do DDD." };
  if (/^(\d)\1+$/.test(assinante.slice(1))) return { ok: false, erro: "Esse número parece inválido. Confira os dígitos." };
  return { ok: true, local: digitos };
}

export type ResultadoWhatsapp = { ok: true; numero: string } | { ok: false; erro: string };

// Restaurante: guarda com 55 na frente, que é o formato que o link wa.me exige.
export function normalizarWhatsappBrasil(entrada: string): ResultadoWhatsapp {
  const celular = validarCelular(entrada);
  return celular.ok ? { ok: true, numero: `55${celular.local}` } : celular;
}

// Cliente do cardápio: guarda só DDD + número, sem o 55.
export function normalizarTelefoneCliente(entrada: string): ResultadoWhatsapp {
  const celular = validarCelular(entrada);
  return celular.ok ? { ok: true, numero: celular.local } : celular;
}

// "88992411296" ou "5588992411296" -> "(88) 99241-1296", também enquanto a pessoa ainda digita.
export function formatarWhatsappBrasil(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  const local = digitos.startsWith("55") && digitos.length > 11 ? digitos.slice(2) : digitos;
  if (local.length === 0) return "";
  const ddd = local.slice(0, 2);
  const resto = local.slice(2, 11);
  if (local.length <= 2) return `(${ddd}`;
  if (resto.length <= 5) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
}
