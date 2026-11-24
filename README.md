# LLM 回應品質評估問卷系統

以 **Next.js 13(前端)+ NestJS 10(後端)+ SQLite(TypeORM)** 打造的雙語(中文/English)網頁問卷,用於對 LLM 回應進行 10 個面向的 5 點量表評分,具備**自動即時存檔**、**後台審視與統計 API/UI**。所有相依套件皆安裝於本專案目錄內,不需系統/全域安裝。

## 功能

### 評分者端
- 登入(姓名 + 通行碼,可中斷後續登、自動續填)
- 每個案例顯示:情境、對話紀錄、病人提問、回應 A、回應 B(供「一致性」評分)、來源文件(供「來源歸因」)
- 10 個面向 × 5 級錨點(雙語,可切換 EN/中文)
- **自動即時存檔**:輸入 800ms 後自動存草稿 + 每 30 秒保險存檔 + 離開頁面 keepalive 存檔 + localStorage 本機鏡射與還原提示
- 未完成所有面向不可送出;送出後鎖定,可「重開為草稿」

### 後台(`/admin`,預設密碼 `admin123`)
- 總覽:評分者/案例/完成率統計卡、評分者 × 案例進度矩陣(✓ 已送出 / ✎ 草稿 / — 未開始)
- 統計:每案例每面向 N/平均數/標準差/中位數/分布長條、評分者平均、全體彙總
- 填寫狀況:依狀態/評分者/案例篩選評分明細與備註(每 15 秒自動刷新)
- 案例管理:JSON 匯入/更新案例、顯示/隱藏、刪除、下載範本
- CSV 匯出(UTF-8 BOM,含 10 面向寬表)

## 快速開始

```bash
cd rubric-survey
npm install          # 安裝根目錄工具(concurrently、sync-rubric)
npm run setup        # 安裝 backend/ 與 frontend/ 相依套件
npm run dev          # 開發模式:後端 :3001(api)+ 前端 :3000
```

正式環境:

```bash
npm run build
npm run start        # 後端 http://localhost:3001/api,前端 http://localhost:3000
```

打開 http://localhost:3000,以通行碼 `eval2026` 登入即可開始;後台在 http://localhost:3000/admin(密碼 `admin123`)。

## 環境變數(皆可在 `backend/.env` 或 shell 設定)

| 變數 | 預設 | 說明 |
|---|---|---|
| `SURVEY_ACCESS_CODE` | `eval2026` | 評分者通行碼 |
| `ADMIN_PASSWORD` | `admin123` | 後台登入密碼 |
| `ADMIN_SECRET` | `dev-secret-change-me` | 後台 token 簽章密鑰 |
| `PORT` | `3001` | 後端埠 |
| `RUBRIC_PATH` | 自動探測 `../rubric.json` | 量表檔位置 |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | 前端 API 位址 |

## 資料與量表

- `rubric.json` — **單一量表來源**(10 面向、雙語錨點與參考文獻);`npm run sync-rubric` 會同步至前後端(開發/建置時自動執行)
- `backend/data/survey.sqlite` — 資料庫(評分者/案例/評分)。後端首次啟動時,若無案例會自動種入 3 個糖尿病示範案例;正式使用請於後台「案例管理」匯入您自己的案例(格式見後台「下載範本」)
- `npm run db:reset` — 清空資料庫重新開始

## API 一覽

評分者端(`x` 為 rater token,由 `POST /api/survey/auth` 取得):
- `POST /api/survey/auth` `{name, accessCode}` → `{token}`
- `GET /api/survey/cases?token=` — 案例清單 + 我的進度
- `GET /api/survey/rating/:caseId?token=` — 我的評分
- `PUT /api/survey/rating/:caseId/draft?token=` `{scores, notes}` — **自動存檔**
- `POST /api/survey/rating/:caseId/submit?token=` — 送出(完整性驗證)
- `POST /api/survey/rating/:caseId/retract?token=` — 重開為草稿

後台(Header `x-admin-token`,由 `POST /api/admin/login` 取得):
- `POST /api/admin/login` `{password}`
- `GET /api/admin/overview` / `GET /api/admin/stats`
- `GET /api/admin/ratings?status=&raterId=&caseId=`
- `GET /api/admin/export` — CSV
- `POST /api/admin/cases`、`PATCH /api/admin/cases/:id`、`DELETE /api/admin/cases/:id`

## 目錄結構

```
rubric-survey/
├─ rubric.json            # 量表單一來源
├─ scripts/sync-rubric.mjs
├─ backend/               # NestJS 10 + TypeORM + better-sqlite3
│  └─ src/{entities,rubric,survey,admin,seed,dto}
└─ frontend/              # Next.js 13 App Router
   └─ src/{app,lib,styles,data}
```
