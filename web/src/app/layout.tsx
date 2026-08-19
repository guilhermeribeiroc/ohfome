import type { Metadata } from "next";
import { Lexend, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { TenantProvider } from "@/lib/tenant-context";

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "OhFome | Gestão para restaurantes",
  description: "OhFome — plataforma de gestão para redes de estabelecimentos de comida",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${lexend.variable} ${bricolage.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
        <TenantProvider>{children}</TenantProvider>
      </body>
    </html>
  );
}
