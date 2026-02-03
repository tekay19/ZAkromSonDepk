import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
    const isLoggedIn = !!req.auth?.user;
    const { pathname } = req.nextUrl;
    const isProtected =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/search") ||
        pathname.startsWith("/analytics");

    if (isProtected && !isLoggedIn) {
        return NextResponse.redirect(new URL("/auth/signin", req.nextUrl));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|google.svg|logo.png).*)"],
};
