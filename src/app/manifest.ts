import type { MetadataRoute } from "next";

/** Portal do Aluno instalável (tela inicial do celular) e base para publicar na Play Store (TWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/portal",
    name: "Portal do Aluno · Cruzeiro do Sul Virtual",
    short_name: "Portal do Aluno",
    description: "Acompanhe sua análise curricular, pendências e a previsão de conclusão do curso.",
    lang: "pt-BR",
    start_url: "/portal",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#003B71",
    categories: ["education"],
    icons: [
      { src: "/app/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
