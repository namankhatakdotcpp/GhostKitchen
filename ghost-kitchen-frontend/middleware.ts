import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const token = req.auth;
  const pathname = req.nextUrl.pathname;

  // Onboarding pages are always accessible
  if (pathname.startsWith("/onboarding")) return NextResponse.next();

  const roles: string[] = (token?.user as any)?.roles ?? ["CUSTOMER"];

  if (pathname.startsWith("/shop") && !roles.includes("RESTAURANT") && !roles.includes("ADMIN")) {
    return NextResponse.redirect(new URL("/onboarding/restaurant", req.url));
  }

  if (pathname.startsWith("/delivery") && !roles.includes("DELIVERY") && !roles.includes("ADMIN")) {
    return NextResponse.redirect(new URL("/onboarding/rider", req.url));
  }

  if (pathname.startsWith("/admin") && !roles.includes("ADMIN")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Protected routes require auth
  const protectedPaths = ["/checkout", "/orders", "/profile"];
  if (protectedPaths.some(p => pathname === p || pathname.startsWith(p + "/"))) {
    if (!token) return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/shop/:path*",
    "/delivery/:path*",
    "/admin/:path*",
    "/checkout",
    "/orders",
    "/profile",
    "/onboarding/:path*",
  ],
};
