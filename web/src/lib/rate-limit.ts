// Limitador simples em memoria para conter forca bruta no login. Suficiente
// para uma instancia unica; em producao com varias instancias, troque por
// um store compartilhado (ex.: Redis).
const tentativas = new Map<string, { contagem: number; resetEm: number }>();

const JANELA_MS = 60_000;
const LIMITE = 8;

export function limitado(chave: string): boolean {
  const agora = Date.now();
  const atual = tentativas.get(chave);

  if (!atual || agora > atual.resetEm) {
    tentativas.set(chave, { contagem: 1, resetEm: agora + JANELA_MS });
    return false;
  }

  atual.contagem += 1;
  return atual.contagem > LIMITE;
}
