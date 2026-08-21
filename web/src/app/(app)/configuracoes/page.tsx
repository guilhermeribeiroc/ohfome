import Link from "next/link";
import { ChevronRight, Clock3, CreditCard, Printer } from "lucide-react";
import { InstalarOhFome } from "@/components/pwa/PwaRegistro";

export default function ConfiguracoesPage() {
  return <div className="of-page">
    <div className="of-page-header"><div><p className="of-eyebrow">Administração</p><h1 className="of-title">Configurações</h1><p className="of-subtitle">Ajuste pagamentos e a estação de impressão do restaurante.</p></div></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Link href="/configuracoes/pagamentos" className="of-panel group flex min-h-48 flex-col justify-between p-6 transition hover:-translate-y-0.5 hover:border-coral-300">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-coral-050 text-coral-600"><CreditCard size={23} /></span>
        <span><b className="text-lg text-ink-900">Pagamentos e Pix</b><span className="mt-1 block text-sm text-ink-500">Escolha Pix manual ou conecte o Mercado Pago.</span></span>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-coral-600">Configurar Pix <ChevronRight size={16} /></span>
      </Link>
      <Link href="/configuracoes/impressao" className="of-panel group flex min-h-48 flex-col justify-between p-6 transition hover:-translate-y-0.5 hover:border-coral-300">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-coral-050 text-coral-600"><Printer size={23} /></span>
        <span><b className="text-lg text-ink-900">Impressão</b><span className="mt-1 block text-sm text-ink-500">Driver, QZ Tray e fila da impressora desta estação.</span></span>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-coral-600">Configurar impressão <ChevronRight size={16} /></span>
      </Link>
      <Link href="/configuracoes/horarios" className="of-panel group flex min-h-48 flex-col justify-between p-6 transition hover:-translate-y-0.5 hover:border-coral-300">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-coral-050 text-coral-600"><Clock3 size={23} /></span>
        <span><b className="text-lg text-ink-900">Horários do cardápio</b><span className="mt-1 block text-sm text-ink-500">Turnos, dias fechados e pausa em imprevistos.</span></span>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-coral-600">Configurar horários <ChevronRight size={16} /></span>
      </Link>
    </div>
    <div className="mt-5"><InstalarOhFome /></div>
  </div>;
}
