import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-sky-700 focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar al contenido
        </a>
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav
            aria-label="Principal"
            className="mx-auto flex w-full max-w-6xl items-center px-4 py-3 sm:px-6"
          >
            <Link href="/" className="font-semibold tracking-tight">
              SecOps Explorer
            </Link>
          </nav>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-zinc-200 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400 sm:px-6">
          <p className="mx-auto w-full max-w-6xl">
            Todo corre en tu navegador: sin cuentas ni rastreadores. Las direcciones IP y los
            nombres que ves son ficticios, tomados de rangos reservados para documentación.
          </p>
        </footer>
      </body>
    </html>
  );
}
