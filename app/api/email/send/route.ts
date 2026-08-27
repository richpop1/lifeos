export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { decrypt } from '@/lib/crypto';
import nodemailer from 'nodemailer';

// POST send email via SMTP
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { accountId, to, subject, body: emailBody, inReplyTo, html } = body;

    if (!accountId || !to || !subject) {
      return NextResponse.json({ error: 'Missing required fields (accountId, to, subject)' }, { status: 400 });
    }

    const account = await prisma.emailAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const password = decrypt(account.encryptedPassword);

    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
      auth: { user: account.email, pass: password },
    });

    const mailOptions: any = {
      from: `"${account.label}" <${account.email}>`,
      to,
      subject,
      text: emailBody || '',
      html: html || undefined,
    };

    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
      mailOptions.references = inReplyTo;
    }

    const info = await transporter.sendMail(mailOptions);

    // Save sent email to DB
    await prisma.email.create({
      data: {
        userId, accountId,
        messageId: info.messageId || `sent-${Date.now()}`,
        fromAddress: account.email,
        fromName: account.label,
        toAddress: to,
        subject,
        bodyText: emailBody || '',
        bodyHtml: html || null,
        date: new Date(),
        isRead: true,
        folder: 'SENT',
      },
    });

    return NextResponse.json({ ok: true, messageId: info.messageId });
  } catch (e: any) {
    console.error('[EMAIL SEND ERROR]', e?.message || e);
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    return NextResponse.json({ error: e?.message || 'Failed to send email' }, { status: 500 });
  }
}
