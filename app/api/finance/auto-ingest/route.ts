export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { ingestFinanceEmails } from '@/lib/finance-ingest';

// POST — Auto-ingest finance transactions from emails
export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await ingestFinanceEmails(userId);
    return NextResponse.json({
      success: true,
      ...result,
      summary: `Created ${result.created} transactions (${result.confirmed} confirmed, ${result.pending} pending review). Skipped ${result.skippedDupes} duplicates, ${result.skippedNoTxns} emails with no transactions.`,
    });
  } catch (e: any) {
    return handleApiError(e);
  }
}
