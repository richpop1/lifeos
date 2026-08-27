export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { encrypt } from '@/lib/crypto';

// PATCH update account
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.type !== undefined) data.type = body.type;
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.balance !== undefined) data.balance = parseFloat(body.balance) || 0;
    if (body.icon !== undefined) data.icon = body.icon;
    if (body.color !== undefined) data.color = body.color;
    if (body.syncEnabled !== undefined) data.syncEnabled = body.syncEnabled;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.apiCredentials !== undefined) {
      data.apiConfig = body.apiCredentials && Object.keys(body.apiCredentials).length > 0
        ? encrypt(JSON.stringify(body.apiCredentials)) : null;
    }
    const account = await prisma.financeAccount.update({
      where: { id: params.id, userId },
      data,
    });
    return NextResponse.json({ ...account, apiConfig: account.apiConfig ? '***' : null });
  } catch (e: any) { return handleApiError(e); }
}

// DELETE account
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    await prisma.financeAccount.delete({ where: { id: params.id, userId } });
    return NextResponse.json({ success: true });
  } catch (e: any) { return handleApiError(e); }
}
