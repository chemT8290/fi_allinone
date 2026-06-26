// api/quote.js
// GET /api/quote?ticker=KRX:005930
// Vercel 서버에서 Google Sheets 임시 수식으로 현재가 조회
// → CORS 없음, 종목설정 시트 불필요

const SHEET_ID = '1gDxo6kKqnG3RdFkqEz9pDMDW5ZuMujSmuLRP7VHQ-BA';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ ok: false, error: 'GET only' });

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ ok: false, error: 'ticker 파라미터 필요' });

  try {
    // ── 방법: Google Sheets QUERY URL (단일 셀 GOOGLEFINANCE 수식 결과) ──
    // ?range=A1&tq=SELECT+A 방식으로 수식 결과를 JSON으로 받음
    // 단, 이 방식은 시트에 미리 수식이 있어야 함 → 별도 "임시조회" 시트 활용

    // 대안: Google Finance 비공식 JSON API
    // https://finance.google.com/finance?q=KRX:005930&output=json
    // → 비공식, 언제든 막힐 수 있음

    // 가장 안정적: Apps Script를 통해 GOOGLEFINANCE 조회
    const asUrl = process.env.APPS_SCRIPT_URL;
    if (asUrl) {
      const asRes = await fetch(`${asUrl}?action=quote&ticker=${encodeURIComponent(ticker)}`);
      if (asRes.ok) {
        const text = await asRes.text();
        try {
          const json = JSON.parse(text);
          if (json.ok && json.curPrice > 0) {
            return res.status(200).json({ ok: true, ticker, curPrice: json.curPrice, dailyPct: json.dailyPct || 0 });
          }
        } catch(e) {}
      }
    }

    // ── 폴백: 동적 Sheets URL로 조회 ──
    // 가격데이터 시트의 특정 행에서 ticker 검색
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${process.env.GID_PRICE || '996077164'}`;
    const csvRes = await fetch(csvUrl);
    if (csvRes.ok) {
      const csvText = await csvRes.text();
      if (!csvText.startsWith('<')) {
        const lines = csvText.trim().split('\n').slice(1); // 헤더 제외
        for (const line of lines) {
          const cols = splitCSV(line);
          const t = (cols[0] || '').trim();
          const code = t.includes(':') ? t.split(':').pop() : t;
          const qCode = ticker.includes(':') ? ticker.split(':').pop() : ticker;
          if (t === ticker || code === qCode) {
            const curPrice = parseFloat(cols[1]) || 0;
            const dailyPct = parseFloat(cols[2]) || 0;
            if (curPrice > 0) {
              return res.status(200).json({ ok: true, ticker, curPrice, dailyPct });
            }
          }
        }
      }
    }

    // 시트에 없는 종목 → Apps Script를 통해 실시간 조회 요청
    return res.status(200).json({
      ok: false,
      error: '시트에 없는 종목입니다. 종목 추가 후 가격이 자동 갱신됩니다.',
      needsSync: true,
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
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
