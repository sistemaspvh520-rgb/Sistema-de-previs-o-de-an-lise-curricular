import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

/**
 * Configuração do Auth.js sem dependências de banco.
 * Usada tanto pelo proxy (rotas) quanto pela configuração completa em auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 30 * 60 },
  trustHost: true,
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.sessionVersion = typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
        session.user.role = token.role as Role;
        session.user.name = token.name ?? null;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.notificationPreferencesConfirmed = Boolean(
          token.notificationPreferencesConfirmed,
        );
        session.user.impersonatorId =
          (token.impersonatorId as string | undefined) ?? null;
        session.user.impersonatorName =
          (token.impersonatorName as string | undefined) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
