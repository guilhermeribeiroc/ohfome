// Inicia o worker de notificações WhatsApp junto do processo Next, sem
// depender de aba do navegador aberta. Ver web/src/lib/whatsapp-worker.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { iniciarWorkerWhatsApp } = await import("./lib/whatsapp-worker");
  iniciarWorkerWhatsApp();
}
