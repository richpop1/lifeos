export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { decrypt } from '@/lib/crypto';

// Sync providers
async function syncTiger(credentials: any, accountId: string, userId: string) {
  // Tiger Brokers Open API - fetch positions
  const { clientId, privateKey, account: tigerAccount } = credentials;
  if (!clientId || !privateKey) throw new Error('Tiger API credentials incomplete');

  // Use Tiger REST API to get positions
  // For now we use a simplified approach - the full Tiger SDK requires complex signing
  // We'll fetch via their HTTP endpoint with proper auth
  const timestamp = Date.now();
  const crypto = require('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${clientId}${timestamp}`);
  const signature = sign.sign(privateKey, 'base64');

  const res = await fetch('https://openapi.itigerup.com/gateway/position', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Tiger-Id': clientId,
      'Sign': signature,
      'Timestamp': String(timestamp),
    },
    body: JSON.stringify({ account: tigerAccount }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tiger API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const positions = data?.data?.items || data?.data || [];
  let totalValue = 0;

  for (const pos of positions) {
    const ticker = pos.symbol || pos.contract?.symbol;
    const qty = pos.position || pos.quantity || 0;
    const mktVal = pos.marketValue || pos.latestPrice * qty || 0;
    const cost = pos.averageCost * qty || 0;
    totalValue += mktVal;

    await prisma.investment.upsert({
      where: { id: `tiger_${ticker}_${accountId}` },
      create: {
        id: `tiger_${ticker}_${accountId}`,
        userId, accountId,
        platform: 'Tiger Brokers',
        assetName: pos.name || ticker,
        ticker, quantity: qty,
        type: 'stock',
        value: mktVal, costBasis: cost,
        currency: pos.currency || 'USD',
      },
      update: {
        quantity: qty, value: mktVal, costBasis: cost,
        assetName: pos.name || ticker,
      },
    });
  }

  return { holdings: positions.length, totalValue };
}

// Helper: recursively sort params and build concatenated string for Crypto.com signing
function paramsSortedString(obj: any): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return String(obj);
  if (Array.isArray(obj)) return obj.map(v => paramsSortedString(v)).join('');
  return Object.keys(obj).sort().map(k => k + paramsSortedString(obj[k])).join('');
}

async function syncCryptoCom(credentials: any, accountId: string, userId: string) {
  const { apiKey, apiSecret } = credentials;
  if (!apiKey || !apiSecret) throw new Error('Crypto.com API credentials incomplete');

  const crypto = require('crypto');
  const reqId = Math.floor(Date.now() / 1000);
  const method = 'private/get-account-summary';
  const nonce = Date.now();
  const params = {};
  const paramsStr = paramsSortedString(params);
  const sigPayload = `${method}${reqId}${apiKey}${paramsStr}${nonce}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(sigPayload).digest('hex');

  console.log('[CDC SYNC] method:', method, 'id:', reqId, 'nonce:', nonce);

  const res = await fetch('https://api.crypto.com/exchange/v1/private/get-account-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: reqId, method, api_key: apiKey, nonce,
      params, sig,
    }),
  });

  const data = await res.json().catch(() => null);
  console.log('[CDC SYNC] response status:', res.status, 'code:', data?.code);

  if (!res.ok || (data?.code && data.code !== 0)) {
    throw new Error(`Crypto.com API error: ${res.status} ${JSON.stringify({ code: data?.code, message: data?.message || data?.msg })}`);
  }

  // data.result.data is an array of position_balances per account
  const positionBalances = data?.result?.data || data?.result?.accounts || [];
  let totalValue = 0;
  const holdings: any[] = [];

  for (const item of positionBalances) {
    // Exchange v1 returns: { currency, balance, available, order, stake, ... }
    // or nested position_balances array
    const entries = item.position_balances || [item];
    for (const acc of entries) {
      const bal = parseFloat(acc.quantity || acc.balance || acc.available || '0');
      if (bal <= 0) continue;
      const coinId = (acc.instrument_name || acc.currency || '').toLowerCase().replace('_usd', '').replace('_usdt', '');
      const mktVal = parseFloat(acc.market_value || '0') || bal; // market_value if available
      totalValue += mktVal;
      holdings.push({ coinId, bal, mktVal, name: acc.instrument_name || acc.currency });

      await prisma.investment.upsert({
        where: { id: `cdc_${coinId}_${accountId}` },
        create: {
          id: `cdc_${coinId}_${accountId}`,
          userId, accountId,
          platform: 'Crypto.com',
          assetName: (acc.instrument_name || acc.currency || coinId).toUpperCase(),
          ticker: coinId, quantity: bal,
          type: 'crypto',
          value: mktVal, costBasis: 0,
          currency: 'USD',
        },
        update: {
          quantity: bal, value: mktVal,
          assetName: (acc.instrument_name || acc.currency || coinId).toUpperCase(),
        },
      });
    }
  }

  return { holdings: holdings.length, totalValue };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const account = await prisma.financeAccount.findFirst({
      where: { id: params.id, userId },
    });
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    if (!account.apiConfig) return NextResponse.json({ error: 'No API credentials configured' }, { status: 400 });

    const credentials = JSON.parse(decrypt(account.apiConfig));
    let result: any;

    switch (account.provider) {
      case 'tiger':
        result = await syncTiger(credentials, account.id, userId);
        break;
      case 'crypto_com':
        result = await syncCryptoCom(credentials, account.id, userId);
        break;
      default:
        return NextResponse.json({ error: `Sync not supported for provider: ${account.provider}` }, { status: 400 });
    }

    // Update account balance & lastSynced
    await prisma.financeAccount.update({
      where: { id: account.id },
      data: { balance: result.totalValue || 0, lastSynced: new Date() },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error('[SYNC ERROR]', e);
    return NextResponse.json({ error: e.message || 'Sync failed' }, { status: 500 });
  }
}
