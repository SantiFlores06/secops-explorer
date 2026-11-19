import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Self-hosted at build time: the browser never requests fonts from Google.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SecOps Explorer · Practica seguridad defensiva",
    template: "%s · SecOps Explorer",
  },
  description:
    "Configura sistemas simulados y observa al instante qué ocurre cuando usuarios legítimos y atacantes chocan contra tu configuración. Gratis, en español y en tu navegador.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${jetbrainsMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-base text-ink">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-10 focus:rounded-control focus:bg-green focus:px-4 focus:py-2 focus:font-bold focus:text-green-ink"
        >
          Saltar al contenido
        </a>
        <header className="border-b border-line bg-panel">
          <nav
            aria-label="Principal"
            className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6"
          >
            <Link href="/" className="text-lg font-extrabold tracking-tight text-ink">
              SecOps <span className="highlight">Explorer</span>
            </Link>
          </nav>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-line bg-panel px-4 py-4 text-xs leading-5 text-muted sm:px-6">
          <p className="mx-auto w-full max-w-6xl">
            Todo corre en tu navegador: sin cuentas ni rastreadores. Las direcciones IP y los
            nombres que ves son ficticios, tomados de rangos reservados para documentación.
          </p>
        </footer>
      </body>
    </html>
  );
}
