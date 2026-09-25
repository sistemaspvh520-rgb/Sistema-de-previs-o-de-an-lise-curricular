import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Caveat } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });
/** Assinatura da campanha "Escolha ter estrela." — substitui a imagem raster. */
const caveat = Caveat({ variable: "--font-script", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "Análise Curricular Inteligente", template: "%s · Análise Curricular" },
  description: "Leitura e interpretação automatizada de análises curriculares — Cruzeiro do Sul Virtual",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable} ${caveat.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
