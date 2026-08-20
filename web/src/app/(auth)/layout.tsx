import Image from "next/image";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh bg-cream-50 lg:grid-cols-[minmax(360px,.82fr)_minmax(560px,1.18fr)]">
      <aside className="relative hidden min-h-dvh overflow-hidden bg-ink-900 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div aria-hidden className="absolute inset-0 opacity-80" style={{ background: "radial-gradient(circle at 12% 18%, rgba(232,93,63,.45), transparent 27rem), radial-gradient(circle at 90% 82%, rgba(238,191,91,.18), transparent 24rem)" }} />
        <div aria-hidden className="absolute inset-0 opacity-[.08]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

        <div className="relative flex items-center gap-4">
          <span className="inline-flex items-center rounded-2xl bg-white px-3.5 py-2.5 shadow-[0_18px_40px_-20px_rgba(0,0,0,.55)]">
            <Image src="/marca/ohfome-logo.svg" alt="OhFome" width={1448} height={1086} className="h-16 w-auto" priority />
          </span>
          <small className="text-[10px] uppercase leading-[1.6] tracking-[.18em] text-white/45">Gestão para<br />quem faz</small>
        </div>

        <div className="relative max-w-lg">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-white/65"><Sparkles size={13} className="text-coral-400" /> Operação em um só ritmo</span>
          <h2 className="font-display text-4xl font-semibold leading-[1.02] tracking-[-.055em] xl:text-5xl">Da primeira comanda ao último fechamento.</h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-white/52">Balcão, cozinha, salão, estoque e delivery conectados em uma experiência simples para toda a equipe.</p>
          <div className="mt-9 grid gap-3 text-xs text-white/65">
            {["Dados separados por estabelecimento", "Permissões por função", "Operação atualizada em tempo real"].map((item) => <span key={item} className="flex items-center gap-2.5"><CheckCircle2 size={15} className="text-basil-400" />{item}</span>)}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-white/32"><ShieldCheck size={14} /> Segurança e privacidade por padrão</div>
      </aside>

      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8 sm:px-8 lg:px-12">
        <div aria-hidden className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-coral-100/35 blur-3xl" />
        <div className="relative w-full max-w-2xl">
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <Image src="/marca/ohfome-logo.svg" alt="OhFome" width={1448} height={1086} className="h-14 w-auto" priority />
          </div>
          <section className="rounded-[1.6rem] border border-cream-200/80 bg-surface/90 p-5 shadow-[0_28px_80px_-48px_rgba(25,23,20,.45)] backdrop-blur-xl sm:p-8">{children}</section>
        </div>
      </main>
    </div>
  );
}
