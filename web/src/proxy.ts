import { NextRequest, NextResponse } from "next/server";

const APEX_DOMAIN = "ohfome.app";
const RESERVADOS = new Set(["www", "app", "api", "admin"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0];

  if (!hostname.endsWith(`.${APEX_DOMAIN}`)) {
    return NextResponse.next();
  }

  const subdominio = hostname.slice(0, -(`.${APEX_DOMAIN}`.length));
  if (RESERVADOS.has(subdominio) || subdominio.includes(".")) {
    return NextResponse.next();
  }

  // Qualquer caminho com "extensão" no último segmento (logo.svg,
  // manifest.json, sw.js, arquivo.pdf...) é um arquivo estático servido de
  // public/ — nunca deve virar /cardapio/<slug>/... Sem essa checagem, toda
  // pasta nova em public/ (marca/, qz/, uploads/...) quebraria de novo nos
  // subdomínios até alguém lembrar de adicionar mais uma exceção aqui.
  const ultimoSegmento = request.nextUrl.pathname.split("/").pop() ?? "";
  if (/\.[a-z0-9]+$/i.test(ultimoSegmento)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/cardapio/${subdominio}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image).*)"],
};
