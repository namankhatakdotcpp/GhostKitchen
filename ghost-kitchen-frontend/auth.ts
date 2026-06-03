import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Minimal type extension — session carries identity, not tokens
declare module "next-auth" {
  interface User {
    id: string;
    roles: string[];
    activeRole: string;
    secondRole?: string | null;
    restaurantId?: string | null;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles: string[];
      activeRole: string;
      secondRole?: string | null;
      restaurantId?: string | null;
    };
  }
}


export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },

  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          // Tokens are set as HttpOnly cookies by the server — we only need
          // the user object to populate the NextAuth session.
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
              }),
              // credentials:"include" not needed for server-side fetch in NextAuth
            }
          );

          if (!res.ok) return null;

          const data = await res.json();
          const user = data.data?.user ?? data.user;
          if (!user?.id) return null;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            roles: user.roles ?? ["CUSTOMER"],
            activeRole: user.activeRole ?? "CUSTOMER",
            secondRole: user.secondRole ?? null,
            restaurantId: user.restaurantId ?? null,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        (token as any).roles = user.roles;
        (token as any).activeRole = user.activeRole;
        (token as any).secondRole = user.secondRole ?? null;
        (token as any).restaurantId = user.restaurantId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as Record<string, unknown>;
      session.user.id = t.id as string;
      session.user.roles = t.roles as string[];
      session.user.activeRole = t.activeRole as string;
      session.user.secondRole = (t.secondRole as string) ?? null;
      return session;
    },
  },
});
