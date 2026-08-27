export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { encrypt } from '@/lib/crypto';

// GET all email accounts for user
export async function GET() {
  try {
    const userId = await requireUserId();
    const accounts = await prisma.emailAccount.findMany({
      where: { userId },
      select: {
        id: true, label: true, email: true, smtpHost: true, smtpPort: true,
        imapHost: true, imapPort: true, isActive: true, createdAt: true,
        _count: { select: { emails: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(accounts);
  } catch (e: any) { return handleApiError(e); }
}

// POST create email account
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { label, email, smtpHost, smtpPort, imapHost, imapPort, password } = body;

    if (!label || !email || !smtpHost || !imapHost || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const encryptedPassword = encrypt(password);

    const account = await prisma.emailAccount.create({
      data: {
        userId, label, email,
        smtpHost, smtpPort: smtpPort || 587,
        imapHost, imapPort: imapPort || 993,
        encryptedPassword,
      },
    });

    return NextResponse.json({ id: account.id, label: account.label, email: account.email });
  } catch (e: any) { return handleApiError(e); }
}

// DELETE email account
export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await prisma.emailAccount.deleteMany({ where: { id, userId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return handleApiError(e); }
}
