// api/load.js — GET /api/load
// Google Sheets에서 holdings, otherAssets, 가격데이터를 읽어 반환

const SHEET_ID  = '1gDxo6kKqnG3RdFkqEz9pDMDW5ZuMujSmuLRP7VHQ-BA';
const GID_PRICE    = '996077164';
const GID_HOLDINGS = process.env.GID_HOLDINGS || '0';
const GID_OTHER    = process.env.GID_OTHER    || '1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  try {
    const [holdingsRes, otherRes, priceRes] = await Promise.allSettled([
      fetchCSV(GID_HOLDINGS),
      fetchCSV(GID_OTHER),
      fetchCSV(GID_PRICE),
    ]);

    const holdings    = holdingsRes.status === 'fulfilled' ? parseHoldings(holdingsRes.value)    : [];
    const otherAssets = otherRes.status    === 'fulfilled' ? parseOtherAssets(otherRes.value)    : [];
    const priceData   = priceRes.status    === 'fulfilled' ? parsePriceData(priceRes.value)      : [];

    return res.status(200).json({ ok: true, holdings, otherAssets, priceData });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function fetchCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const r   = await fetch(url);
  if (!r.ok) throw new Error(`CSV fetch 실패 gid=${gid} (${r.status})`);
  const text = await r.text();
  if (text.trim().startsWith('<')) throw new Error(`시트 공개 설정 필요 gid=${gid}`);
  return text;
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

function parseCSV(text) {
  const lines   = text.trim().split('\n');
  const headers = splitCSV(lines[0]);
  return lines.slice(1)
    .map(line => {
      const cols = splitCSV(line);
      const obj  = {};
      headers.forEach((h, i) => { obj[h.trim()] = (cols[i] || '').trim(); });
      return obj;
    })
    .filter(row => Object.values(row).some(v => v !== ''));
}

function parseHoldings(csv) {
  return parseCSV(csv).map(r => ({
    id:       +r.id || 0,
    name:     r.name     || '',
    ticker:   r.ticker   || '',
    exchange: r.exchange || '',
    type:     r.type     || 'stock',
    currency: r.currency || 'KRW',
    shares:   +r.shares   || 0,
    avgPrice: +r.avgPrice || 0,
    curPrice: +r.curPrice || 0,
    dailyPct: +r.dailyPct || 0,
    sector:   r.sector   || '',
  })).filter(r => r.id && r.name);
}

function parseOtherAssets(csv) {
  return parseCSV(csv).map(r => ({
    id:   +r.id || 0,
    name: r.name || '',
    type: r.type || 'deposit',
    cost: +r.cost || 0,
    cur:  +r.cur  || 0,
    rate: r.rate  || '',
    due:  r.due   || '',
    memo: r.memo  || '',
  })).filter(r => r.id && r.name);
}

function parsePriceData(csv) {
  const lines   = csv.trim().split('\n');
  const dataLines = isNaN(parseFloat(splitCSV(lines[0])[1])) ? lines.slice(1) : lines;
  return dataLines.map(line => {
    const cols     = splitCSV(line);
    const ticker   = (cols[0] || '').trim();
    const curPrice = parseFloat(cols[1]) || 0;
    const dailyPct = parseFloat(cols[2]) || 0;
    const spark    = cols.slice(3).map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    return { ticker, curPrice, dailyPct, spark };
  }).filter(r => r.ticker && r.curPrice > 0);
}
