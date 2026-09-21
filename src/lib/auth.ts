import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { getClientIp } from "@/lib/request-ip";

const credentialsSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(200),
});

/** Intervalo em que o perfil/ativação do usuário é reconferido no banco para invalidar sessões revogadas. */
const SESSION_RECHECK_MS = 5 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role;
        token.name = user.name;
        token.checkedAt = Date.now();
        return token;
      }
      // Revogação: usuário desativado ou com perfil alterado perde a sessão em até 5 minutos.
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      const userId = typeof token.id === "string" ? token.id : null;
      if (userId && (trigger === "update" || Date.now() - checkedAt > SESSION_RECHECK_MS)) {
        const current = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true, name: true } });
        if (!current || !current.isActive) return null;
        token.role = current.role;
        token.name = current.name;
        token.checkedAt = Date.now();
      }
      return token;
    },
  },
  providers: [
    Credentials({
      name: "Credenciais",
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const ip = request?.headers ? getClientIp(request.headers) : "unknown";
        const limit = rateLimit(`login:${ip}`, { capacity: 5, refillPerMinute: 5 });
        if (!limit.allowed) {
          logger.warn("Rate limit de login atingido", { ip });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user || !user.isActive) return null;

        const ok = await verify(user.passwordHash, parsed.data.password);
        if (!ok) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await prisma.auditLog.create({
          data: { userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip },
        });

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
