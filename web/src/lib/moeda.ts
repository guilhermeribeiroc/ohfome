/** Formatação tolerante para digitação em pt-BR: 1500,5 → 1.500,5. */
export function mascararMoeda(valor: string): string {
  const limpo = valor.replace(/[^\d,\.]/g, "");
  const comVirgula = limpo.includes(",");
  const partes = (comVirgula ? limpo : normalizarPontoDecimal(limpo)).split(",");
  const inteiro = (partes[0] ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
  const decimal = (partes.slice(1).join("").replace(/\D/g, "")).slice(0, 2);
  const inteiroFormatado = Number(inteiro).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return limpo.endsWith(",") || decimal ? `${inteiroFormatado},${decimal}` : inteiroFormatado;
}

function normalizarPontoDecimal(valor: string): string {
  const pontos = valor.split(".");
  if (pontos.length === 2 && pontos[1].length > 0 && pontos[1].length <= 2) return `${pontos[0]},${pontos[1]}`;
  return valor;
}

export function numeroDaMoeda(valor: string): number {
  const limpo = valor.trim();
  if (!limpo) return 0;
  const numero = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

export function moedaComCentavos(valor: string): string {
  const numero = numeroDaMoeda(valor);
  return numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
