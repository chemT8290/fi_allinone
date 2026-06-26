// api/quote.js  — GET /api/quote?ticker=KRX:005930
// Vercel 서버에서 Yahoo Finance API 직접 호출 (CORS 없음, 빠름)

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzznRRS2XLNqEBavx33kHhf9qmclxgDiduv7yCG72fxA2asjD2S-8WPJKq7AG9syqzT-g/exec';
const SHEET_ID  = '1gDxo6kKqnG3RdFkqEz9pDMDW5ZuMujSmuLRP7VHQ-BA';
const GID_PRICE = '996077164';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ ok: false, error: 'ticker 필요' });

  const yahooSymbol = toYahooSymbol(ticker);

  // ── 1순위: Yahoo Finance API (빠름, 1~2초) ──
  try {
    const data = await fetchYahoo(yahooSymbol);
    if (data.ok) return res.status(200).json({ ...data, ticker });
  } catch(e) {}

  // ── 2순위: query2 도메인 재시도 ──
  try {
    const data = await fetchYahoo(yahooSymbol, true);
    if (data.ok) return res.status(200).json({ ...data, ticker });
  } catch(e) {}

  // ── 3순위: 가격데이터 Sheets CSV (기존 보유 종목) ──
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID_PRICE}`;
    const csvRes = await fetch(csvUrl);
    if (csvRes.ok) {
      const csvText = await csvRes.text();
      if (!csvText.startsWith('<')) {
        const lines = csvText.trim().split('\n').slice(1);
        for (const line of lines) {
          const cols = splitCSV(line);
          const t    = (cols[0] || '').trim();
          const tCode = t.includes(':') ? t.split(':').pop() : t;
          const qCode = ticker.includes(':') ? ticker.split(':').pop() : ticker;
          if (t === ticker || tCode === qCode) {
            const curPrice = parseFloat(cols[1]) || 0;
            const dailyPct = parseFloat(cols[2]) || 0;
            if (curPrice > 0) {
              return res.status(200).json({ ok: true, ticker, curPrice, dailyPct, source: 'sheets' });
            }
          }
        }
      }
    }
  } catch(e) {}

  return res.status(200).json({ ok: false, error: '가격 조회 실패 — 직접 입력해주세요' });
}

async function fetchYahoo(symbol, useQuery2 = false) {
  const domain = useQuery2 ? 'query2' : 'query1';
  const url = `https://${domain}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta || !meta.regularMarketPrice) throw new Error('데이터 없음');

  const curPrice  = meta.regularMarketPrice;
  const prevClose = meta.previousClose || meta.chartPreviousClose || curPrice;
  const dailyPct  = prevClose > 0 ? (curPrice - prevClose) / prevClose * 100 : 0;
  const closes    = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
  const spark     = closes.filter(v => v != null && v > 0).map(v => Math.round(v * 100) / 100);

  return {
    ok:       true,
    yahooSymbol: symbol,
    curPrice: Math.round(curPrice * 100) / 100,
    dailyPct: Math.round(dailyPct * 100) / 100,
    spark,
    source:   'yahoo',
  };
}

function toYahooSymbol(ticker) {
  const t = ticker.trim();
  if (t.includes('.')) return t;
  if (t.includes(':')) {
    const [exch, code] = t.split(':');
    switch (exch.toUpperCase()) {
      case 'KRX': case 'KSC': return code + '.KS';
      case 'KOE':             return code + '.KQ';
      case 'TYO':             return code + '.T';
      case 'HKG':             return code + '.HK';
      default:                return code;       // NASDAQ, NYSE 등 미국
    }
  }
  if (/^\d{6}$/.test(t)) return t + '.KS';
  return t;
}

function splitCSV(line) {
  const result = [], re = /("([^"]*)"|([^,]*))(,|$)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    result.push(m[2] !== undefined ? m[2] : (m[3] || ''));
    if (m[4] === '') break;
  }
  return result;
}
