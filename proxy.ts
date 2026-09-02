import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticationMode } from "@/shared/actor/actor-environment";

const publicPaths = new Set(["/api/health", "/login"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/auth/") || publicPaths.has(pathname)) {
    if (pathname !== "/login") return NextResponse.next();
  }

  const mode = resolveAuthenticationMode(process.env);
  if (mode === "local") {
    return pathname === "/login" ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  const hasSession = Boolean(getSessionCookie(request));
  if (pathname === "/login") {
    return hasSession ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json(
      { error: "UNAUTHENTICATED" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
