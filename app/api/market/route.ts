export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

// Cache prices for 5 minutes to avoid hammering free APIs
const cache: Record<string, { price: number; change24h: number; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000;

async function fetchStockPrice(ticker: string): Promise<{ price: number; change24h: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const currentPrice = closes[closes.length - 1] ?? result?.meta?.regularMarketPrice ?? 0;
    const prevClose = result?.meta?.chartPreviousClose ?? closes[0] ?? currentPrice;
    const change24h = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    return { price: currentPrice, change24h };
  } catch (e) {
    console.error(`Stock fetch error for ${ticker}:`, e);
    return null;
  }
}

async function fetchCryptoPrice(coinId: string): Promise<{ price: number; change24h: number } | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const coin = data?.[coinId];
    if (!coin) return null;
    return { price: coin.usd ?? 0, change24h: coin.usd_24h_change ?? 0 };
  } catch (e) {
    console.error(`Crypto fetch error for ${coinId}:`, e);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tickers: { ticker: string; type: string }[] = body?.tickers ?? [];

    if (!tickers.length) return NextResponse.json({});

    const results: Record<string, { price: number; change24h: number }> = {};
    const now = Date.now();

    // Process sequentially to be gentle on free APIs
    for (const { ticker, type } of tickers) {
      const key = `${type}:${ticker}`;
      // Check cache
      if (cache[key] && now - cache[key].ts < CACHE_TTL) {
        results[ticker] = { price: cache[key].price, change24h: cache[key].change24h };
        continue;
      }

      let data: { price: number; change24h: number } | null = null;
      if (type === 'crypto') {
        data = await fetchCryptoPrice(ticker);
      } else {
        data = await fetchStockPrice(ticker);
      }

      if (data) {
        cache[key] = { ...data, ts: now };
        results[ticker] = data;
      }
    }

    return NextResponse.json(results);
  } catch (e: any) {
    console.error('Market API error:', e);
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
