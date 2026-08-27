import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Get the authenticated user's ID from the session.
 * Returns null if not authenticated.
 */
export async function getAuthUserId(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    return (session?.user as any)?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the authenticated user's ID, or throw 401 if not authenticated.
 * Use this in API routes that require authentication.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('UNAUTHORIZED');
  return userId;
}

/**
 * Legacy: get default user ID (for seed/test only).
 */
export async function getDefaultUserId() {
  const user = await prisma.user.findUnique({ where: { email: 'john@doe.com' } });
  return user?.id ?? '';
}
