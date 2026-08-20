import type { ComponentProps } from "react";

/** Símbolo oficial do OhFome, usado em áreas compactas da interface. */
export function OhFomeMark({ className, ...props }: Omit<ComponentProps<"img">, "src" | "alt">) {
  return <img src="/marca/ohfome-icone.svg" alt="" className={className} aria-hidden="true" {...props} />;
}
