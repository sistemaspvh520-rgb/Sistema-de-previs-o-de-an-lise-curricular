"use client";

import "./globals.css";
import { PageLoadError } from "@/components/shared/page-load-error";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 font-sans text-foreground">
        <title>Não foi possível carregar · Análise Curricular</title>
        <PageLoadError error={error} fullscreen />
      </body>
    </html>
  );
}
