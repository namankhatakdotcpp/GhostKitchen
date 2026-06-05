import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This app uses backend JWT cookies for auth (not NextAuth sessions).
// Role-based access control is handled by page-level components and layouts.
// Middleware only provides a pass-through — no role checks here.
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [], // nothing intercepted at middleware level
};
