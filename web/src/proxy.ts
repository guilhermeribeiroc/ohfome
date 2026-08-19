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

  const url = request.nextUrl.clone();
  url.pathname = `/cardapio/${subdominio}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
