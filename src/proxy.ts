import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { can, ROUTE_PERMISSIONS } from "@/lib/rbac";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = [
  "/portal/login",
  "/portal/primeiro-acesso",
  "/portal/recuperar",
  "/portal/definir-senha",
  "/login",
  "/definir-senha",
  "/esqueci-senha",
  "/api/auth",
  "/api/cron",
  "/api/health",
];

export const proxy = auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  const isLoggedIn = !!req.auth?.user;

  if (isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const loginUrl = new URL(path.startsWith("/portal") ? "/portal/login" : "/login", nextUrl);
    if (path !== "/") loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth?.user?.role === "STUDENT") {
    if (path === "/portal" || path.startsWith("/portal/") || path.startsWith("/api/portal/")) return NextResponse.next();
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    return NextResponse.redirect(new URL("/portal", nextUrl));
  }

  // Primeiro acesso: obriga a definir a própria senha antes de usar o sistema (exceto em impersonação).
  if (
    req.auth?.user?.mustChangePassword &&
    !req.auth?.user?.impersonatorId &&
    !path.startsWith("/settings/account") &&
    !path.startsWith("/api/")
  ) {
    return NextResponse.redirect(new URL("/settings/account?first=1", nextUrl));
  }

  // Admins e analistas precisam escolher a cadência antes de acessar a operação.
  if (
    can(req.auth?.user?.role, "analysis:create") &&
    !req.auth?.user?.notificationPreferencesConfirmed &&
    !req.auth?.user?.impersonatorId &&
    !path.startsWith("/settings/account") &&
    !path.startsWith("/api/")
  ) {
    return NextResponse.redirect(
      new URL("/settings/account?notifications=required", nextUrl),
    );
  }

  if (path === "/") {
    return NextResponse.redirect(
      new URL(
        can(req.auth?.user?.role, "analysis:create")
          ? "/analyses/new"
          : "/analyses",
        nextUrl,
      ),
    );
  }

  const role = req.auth?.user?.role;
  const rule = ROUTE_PERMISSIONS.find(
    (r) => path === r.prefix || path.startsWith(`${r.prefix}/`),
  );
  if (rule && !can(role, rule.permission)) {
    return NextResponse.redirect(
      new URL(
        can(role, "analysis:create")
          ? "/analyses/new?forbidden=1"
          : "/analyses?forbidden=1",
        nextUrl,
      ),
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!brand/|_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:png|svg|jpg|jpeg|ico|webp|woff2?)$).*)",
  ],
};
