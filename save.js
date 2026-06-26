// api/save.js
// POST /api/save
// Vercel 서버에서 Apps Script로 POST → CORS 없이 Sheets 저장

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzznRRS2XLNqEBavx33kHhf9qmclxgDiduv7yCG72fxA2asjD2S-8WPJKq7AG9syqzT-g/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  try {
    const body = req.body; // Vercel이 자동 파싱

    // Vercel 서버 → Apps Script (서버-서버, CORS 없음)
    const asRes = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Apps Script는 리다이렉트 응답을 줄 수 있음
    // 응답 코드가 200~302이면 성공으로 간주
    if (asRes.ok || asRes.status === 302) {
      return res.status(200).json({ ok: true });
    }

    const text = await asRes.text();
    return res.status(500).json({ ok: false, error: `Apps Script 오류: ${asRes.status}`, detail: text.slice(0, 200) });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
