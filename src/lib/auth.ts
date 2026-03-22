import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user?.password) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Auto-connect Gmail when signing in with Google
      if (account?.provider === "google" && user.id && user.email) {
        try {
          await prisma.emailAccount.upsert({
            where: {
              userId_provider_email: {
                userId: user.id,
                provider: "google",
                email: user.email,
              },
            },
            update: {
              accessToken: account.access_token!,
              refreshToken: account.refresh_token ?? undefined,
              tokenExpiry: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
            create: {
              userId: user.id,
              provider: "google",
              email: user.email,
              accessToken: account.access_token!,
              refreshToken: account.refresh_token ?? null,
              tokenExpiry: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
          });
        } catch (err) {
          console.error("Failed to auto-connect Gmail:", err);
          // Don't block sign-in if email connection fails
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
