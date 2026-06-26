// api/load.js
// GET /api/load
// Google Sheets에서 holdings, otherAssets, 가격데이터를 읽어 반환

const SHEET_ID = '1gDxo6kKqnG3RdFkqEz9pDMDW5ZuMujSmuLRP7VHQ-BA';

// Google Sheets를 서비스 계정으로 읽는 대신
// 공개 CSV export URL을 서버에서 fetch (CORS 없음)
export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  try {
    const results = await Promise.allSettled([
      fetchSheetCSV('holdings'),      // gid는 환경변수 또는 고정값
      fetchSheetCSV('other_assets'),
      fetchSheetCSV('price_data'),
    ]);

    const [holdingsRes, otherRes, priceRes] = results;

    const holdings    = holdingsRes.status    === 'fulfilled' ? parseHoldings(holdingsRes.value)    : [];
    const otherAssets = otherRes.status       === 'fulfilled' ? parseOtherAssets(otherRes.value)     : [];
    const priceData   = priceRes.status       === 'fulfilled' ? parsePriceData(priceRes.value)       : [];

    return res.status(200).json({ ok: true, holdings, otherAssets, priceData });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Sheets 탭별 CSV URL ──
// 탭 이름 → gid는 Vercel 환경변수로 관리
const SHEET_GIDS = {
  holdings:     process.env.GID_HOLDINGS    || '0',
  other_assets: process.env.GID_OTHER       || '1',
  price_data:   process.env.GID_PRICE       || '996077164',
};

async function fetchSheetCSV(sheetKey) {
  const gid = SHEET_GIDS[sheetKey];
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CSV fetch 실패: ${sheetKey} (${res.status})`);
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error(`시트 공개 설정 필요: ${sheetKey}`);
  return text;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (cols[i] || '').trim(); });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));
}

function splitCSVLine(line) {
  const result = [], re = /("([^"]*)"|([^,]*))(,|$)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    result.push(m[2] !== undefined ? m[2] : (m[3] || ''));
    if (m[4] === '') break;
  }
  return result;
}

function parseHoldings(csv) {
  return parseCSV(csv).map(r => ({
    id:       +r.id || 0,
    name:     r.name || '',
    ticker:   r.ticker || '',
    exchange: r.exchange || '',
    type:     r.type || 'stock',
    currency: r.currency || 'KRW',
    shares:   +r.shares || 0,
    avgPrice: +r.avgPrice || 0,
    curPrice: +r.curPrice || 0,
    dailyPct: +r.dailyPct || 0,
    sector:   r.sector || '',
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
  return parseCSV(csv).map(r => {
    // D열 이후는 spark 데이터
    const spark = Object.keys(r)
      .filter(k => !['ticker','현재가','일간변동률(%)'].includes(k))
      .map(k => +r[k]).filter(v => !isNaN(v) && v > 0);
    return {
      ticker:   r['ticker'] || r['A'] || '',
      curPrice: +(r['현재가'] || r['B'] || 0),
      dailyPct: +(r['일간변동률(%)'] || r['C'] || 0),
      spark,
    };
  }).filter(r => r.ticker);
}
