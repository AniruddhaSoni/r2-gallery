import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const pathname = req.nextUrl.pathname;

  // Allow auth routes
  if (pathname.startsWith("/api/auth") || pathname === "/login") {
    return NextResponse.next();
  }

  // API routes - use Bearer token auth
  if (pathname.startsWith("/api/")) {
    const expected =
      process.env.APP_PASSWORD || process.env.NEXT_PUBLIC_APP_PASSWORD;
    if (expected) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${expected}`) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }
    return NextResponse.next();
  }

  // UI routes - require session
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
