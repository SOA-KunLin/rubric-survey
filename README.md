# LLM 回應品質評估問卷系統

以 **Next.js 13(前端)+ NestJS 10(後端)+ SQLite(TypeORM)** 打造的**設定檔驅動**雙語(中文/English)網頁問卷平台:管理者只需調整 `survey.config.json` 即可決定網站視覺主題、案例數量、每個案例的題數/題型/欄位,並支援巢狀模板(`$use` / `$ref`)重複使用共用定義。具備**自動即時存檔**與**後台審視/統計**。所有相依套件皆安裝於本專案目錄內,不需系統/全域安裝。

## 設定檔 `survey.config.json`(單一問卷定義來源)

三個層次:

1. **全域網站設定 `site`**:`theme`(內建 `light` / `dark` / `ocean` / `forest` / `high-contrast`,或以 `themeColors` 直接指定 CSS 變數)、標題/副標題、`defaultLang`、`allowLangToggle`、`showNotes`、作答說明與參考文獻。
2. **案例數設定 `cases`**:陣列裡有幾個案例,評分者就看到幾個;每個案例可 `active: false` 暫時隱藏。
3. **案例內問卷設定 `questions` / `content`**:每個案例各自定義題目陣列與內容區塊;題型支援 `anchor`(錨點量表)、`singleChoice`、`number`(min/max)、`text`、`yesno`;`required` 控制必填;`appliesIf: {"hasResponseB": true}` 條件顯示(如「一致性」僅在案例有回應 B 時出現)。

**巢狀模板**:`templates` 下可放共用定義;任何節點用 `"$use": "模板名"`(或 `"$ref": "#/templates/x"`)引入後**深層合併**,inline 欄位覆蓋模板值;空物件(純引用)保留模板值。量表錨點(`rubric.json` 的 10 個面向)自動註冊為 `rubric:<key>` 模板,例如 `{"$use": "rubric:accuracy"}`。後台「問卷設定」頁可直接編輯 JSON、驗證並套用(熱生效,免重啟),亦可下載目前設定。

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

> 需求:Node.js **18+(建議 20/22/24)**、npm、just。`better-sqlite3@11` 對這些版本皆提供官方 prebuild,`just` 會在每次啟動前自動以當前 Node 重編/對齊,切換 Node 版本不需手動處理。

```bash
cd rubric-survey
just dev      # 一鍵:裝依賴(若缺)→ 對齊 native 模組 → 啟動前後端
```

也可以不用 just:

```bash
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

- `survey.config.json` — **問卷主設定檔**(主題/案例/題目,支援巢狀模板);後端啟動時載入並驗證,後台可線上編輯熱套用
- `rubric.json` — 錨點庫(10 個面向的雙語錨點與文獻),供設定檔以 `rubric:<key>` 引用
- `backend/data/survey.sqlite` — 資料庫(評分者/評分);案例內容由設定檔驅動,不再存於資料庫
- `npm run db:reset` / `just reset-db` — 清空評分資料(示範案例來自設定檔,重啟即還原)

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
- `GET /api/admin/config` / `PUT /api/admin/config` — 讀取/更新問卷設定檔(驗證後寫入並熱重載)
- `PATCH /api/admin/cases/:id` `{active}`、`DELETE /api/admin/cases/:id` — 顯示/隱藏、刪除案例(寫回設定檔)

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
