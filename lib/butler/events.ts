import { prisma } from '@/lib/prisma';

/**
 * Append-only audit log. Fire-and-forget — failures are swallowed
 * so a failed Event insert never breaks an already-executed tool.
 */
export async function logEvent(
  userId: string,
  type: string,
  entityType?: string | null,
  entityId?: string | null,
  data?: Record<string, any> | null,
): Promise<void> {
  try {
    await prisma.event.create({
      data: {
        userId,
        type,
        entityType: entityType ?? undefined,
        entityId: entityId ?? undefined,
        data: data ?? undefined,
      },
    });
  } catch (err) {
    // Non-critical: log and swallow. Never let audit logging fail a user action.
    console.error('[EVENT] Failed to log event:', type, err instanceof Error ? err.message : err);
  }
}
