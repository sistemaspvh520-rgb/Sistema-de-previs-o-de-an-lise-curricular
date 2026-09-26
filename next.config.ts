import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (isProd ? "" : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Identifica cada publicação: quando uma aba aberta antes de um deploy navega para o servidor
  // novo, o Next.js detecta a diferença e recarrega a página em vez de mostrar "This page couldn't load".
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || undefined,
  // Server Action arguments can contain passwords and one-time tokens.
  logging: { serverFunctions: false, incomingRequests: { ignore: [/definir-senha/] } },
  poweredByHeader: false,
  serverExternalPackages: ["pdfjs-dist", "@node-rs/argon2", "@prisma/client", "pg"],
  // Arquivos lidos em runtime que o rastreamento automático não vê: worker/fontes do pdf.js
  // (carregados por import() dinâmico em Node) — sem isso o upload falha na Vercel com "PDF corrompido".
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**",
      "./node_modules/pdfjs-dist/cmaps/**",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
