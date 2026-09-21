import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { can, ROUTE_PERMISSIONS } from "@/lib/rbac";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/definir-senha", "/esqueci-senha", "/api/auth", "/api/cron", "/api/health"];

export const proxy = auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const isLoggedIn = !!req.auth?.user;

  if (isPublic) {
    if (path === "/login" && isLoggedIn) {
      return NextResponse.redirect(new URL(can(req.auth?.user?.role, "analysis:create") ? "/analyses/new" : "/analyses", nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const loginUrl = new URL("/login", nextUrl);
    if (path !== "/") loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  // Primeiro acesso: obriga a definir a própria senha antes de usar o sistema (exceto em impersonação).
  if (req.auth?.user?.mustChangePassword && !req.auth.user.impersonatorId && !path.startsWith("/settings/account") && !path.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/settings/account?first=1", nextUrl));
  }

  if (path === "/") {
    return NextResponse.redirect(new URL(can(req.auth?.user?.role, "analysis:create") ? "/analyses/new" : "/analyses", nextUrl));
  }

  const role = req.auth?.user?.role;
  const rule = ROUTE_PERMISSIONS.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`));
  if (rule && !can(role, rule.permission)) {
    return NextResponse.redirect(new URL(can(role, "analysis:create") ? "/analyses/new?forbidden=1" : "/analyses?forbidden=1", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|ico|webp|woff2?)$).*)"],
};
