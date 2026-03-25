import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import type { UserRole } from "@/types";

type AuthToken = {
  role?: UserRole;
  accessToken?: string;
  id?: string;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
              }),
            }
          );

          if (!res.ok) {
            return null;
          }

          const data = await res.json();

          return {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            role: data.user.role,
            accessToken: data.token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const nextToken = token as typeof token & AuthToken;

      if (user) {
        nextToken.id = user.id as string;
        nextToken.role = user.role as UserRole;
        nextToken.accessToken = user.accessToken as string;
      }

      return nextToken;
    },
    async session({ session, token }) {
      const nextToken = token as typeof token & AuthToken;

      session.user.id = nextToken.id as string;
      session.user.role = nextToken.role as UserRole;
      (session as typeof session & { accessToken?: string }).accessToken =
        nextToken.accessToken as string;

      return session;
    },
  },
});
