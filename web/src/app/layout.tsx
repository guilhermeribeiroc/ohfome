import type { Metadata } from "next";
import "./globals.css";
import { TenantProvider } from "@/lib/tenant-context";

export const metadata: Metadata = {
  title: "OhFome | Gestão para restaurantes",
  description: "OhFome — plataforma de gestão para redes de estabelecimentos de comida",
  icons: {
    icon: [
      { url: "/marca/ohfome-favicon.png?v=20260823", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/marca/ohfome-favicon.png?v=20260823",
    apple: "/marca/ohfome-favicon.png?v=20260823",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full font-sans antialiased">
        <TenantProvider>{children}</TenantProvider>
      </body>
    </html>
  );
}
