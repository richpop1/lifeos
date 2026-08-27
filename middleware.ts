import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/login' },
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login
     * - /api/auth (NextAuth routes)
     * - /api/signup (for test automation)
     * - /_next (Next.js internals)
     * - /favicon.svg, /og-image.png (static assets)
     */
    '/((?!login|api/auth|api/signup|api/briefing|_next|favicon\\.svg|og-image\\.png).*)',
  ],
};
