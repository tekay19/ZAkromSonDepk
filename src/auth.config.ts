import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export default {
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
    ],
    session: { strategy: "jwt" }, // Optimized for high scalability (thousands of users)
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
            const isOnSearch = nextUrl.pathname.startsWith("/search"); // if any
            const isOnAnalytics = nextUrl.pathname.startsWith("/analytics");

            if (isOnDashboard || isOnSearch || isOnAnalytics) {
                if (isLoggedIn) return true;
                return false; // Redirect to unauthenticated
            }
            return true;
        },
    },
} satisfies NextAuthConfig;
