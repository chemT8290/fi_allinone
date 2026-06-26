// api/save.js — POST /api/save
// Vercel 서버에서 Apps Script로 POST → Sheets 저장 (서버-서버, CORS 없음)

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzznRRS2XLNqEBavx33kHhf9qmclxgDiduv7yCG72fxA2asjD2S-8WPJKq7AG9syqzT-g/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Vercel 서버 → Apps Script (서버-서버, CORS 없음)
    const asRes = await fetch(APPS_SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(15000),
    });

    // Apps Script는 302 리다이렉트를 줄 수 있음 → ok로 간주
    if (asRes.ok || asRes.status === 302 || asRes.redirected) {
      return res.status(200).json({ ok: true });
    }

    const text = await asRes.text().catch(() => '');
    return res.status(500).json({ ok: false, error: `Apps Script ${asRes.status}`, detail: text.slice(0, 200) });

  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
