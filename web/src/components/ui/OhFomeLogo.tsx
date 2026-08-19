import type { SVGProps } from "react";

/** Símbolo OhFome: prato aberto, calor e o ponto coral da operação em movimento. */
export function OhFomeMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true" {...props}>
      <path d="M24 7.5c-9.12 0-16.5 7.39-16.5 16.5S14.88 40.5 24 40.5c5.05 0 9.57-2.27 12.6-5.85" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M15 28.5h18M18.2 34h11.6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M19.2 22c0-2 1.45-2.7 1.45-4.8M24 22c0-2 1.45-2.7 1.45-4.8M28.8 22c0-2 1.45-2.7 1.45-4.8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="38.25" cy="11.25" r="4.75" fill="var(--color-coral-500)" stroke="var(--color-cream-50)" strokeWidth="2.5" />
    </svg>
  );
}
