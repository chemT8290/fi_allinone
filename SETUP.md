# Vercel 환경변수 설정 가이드

## Vercel 대시보드 → 프로젝트 → Settings → Environment Variables

아래 변수를 추가하세요:

| 변수명 | 값 | 설명 |
|---|---|---|
| `APPS_SCRIPT_URL` | Apps Script 배포 URL | /api/save에서 Sheets 저장 시 사용 |
| `GID_HOLDINGS` | holdings 시트의 GID | holdings 시트 탭 우클릭 → 시트 ID |
| `GID_OTHER` | other_assets 시트의 GID | other_assets 시트 탭 우클릭 → 시트 ID |
| `GID_PRICE` | 가격데이터 시트의 GID | = 996077164 (현재 고정) |

## Google Sheets 준비

1. 스프레드시트 → 공유 → **링크가 있는 모든 사용자 → 뷰어** 설정
2. 아래 시트가 자동으로 생성됩니다:
   - `가격데이터` : 가격 갱신 시 Apps Script가 자동 관리
   - `holdings`   : 주식·ETF 보유 목록 (종목 추가 시 자동 저장)
   - `other_assets`: 비투자 자산 목록 (자산 추가 시 자동 저장)

## Apps Script 준비

apps-script-api.js 코드를 Apps Script에 붙여넣고
**새 배포 → 웹 앱 → 모든 사용자 접근** 으로 배포

## 작동 흐름

```
[접속 시]
브라우저 → /api/load (Vercel)
              ↓
          Google Sheets CSV fetch (서버-서버, CORS 없음)
              ↓
          holdings + otherAssets + 가격데이터 반환

[저장 시]
브라우저 → /api/save (Vercel)
              ↓
          Apps Script POST (서버-서버, CORS 없음)
              ↓
          Google Sheets holdings/other_assets 시트 업데이트
```

## GitHub에 올릴 파일 목록

```
your-repo/
├── index.html        ← fi-all-in-one.html 내용
├── api/
│   ├── load.js       ← GET /api/load
│   └── save.js       ← POST /api/save
└── vercel.json
```
