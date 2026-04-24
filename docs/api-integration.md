# 外部 API 連携仕様

## 楽天ウェブサービス（商品検索 API）

- **エンドポイント**: `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706`
- **認証**: `applicationId` パラメータ
- **レート制限**: 1 秒 1 リクエスト、1 日ベース制限あり
- **秘密保管**: `RAKUTEN_APP_ID` を Wrangler Secret

### 利用方針

- `keyword` には機種品番（`modelNumber`）を使う
- `hits=5` で上位 5 件取得、最安値と平均値を算出
- エラー時は `null` を記録（レコード自体は作成）

### 取得パラメータ例

```
keyword=NA-LX129DL
hits=5
sort=+itemPrice
applicationId=${SECRET}
format=json
```

## Yahoo! ショッピング（商品検索 API V3）

- **エンドポイント**: `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch`
- **認証**: `appid` パラメータ
- **レート制限**: 1 日 50,000 リクエストまで
- **秘密保管**: `YAHOO_CLIENT_ID` を Wrangler Secret

### 利用方針

- `query` に機種品番
- `results=5` で取得、最安値と平均値を算出
- `in_stock=true` で在庫あり絞り込み

## GitHub Contents API

- **エンドポイント**: `PUT /repos/{owner}/{repo}/contents/{path}`
- **認証**: Fine-grained PAT（`contents: write`）
- **秘密保管**: `GITHUB_TOKEN` を Wrangler Secret

### 更新フロー

```
1. GET /repos/{owner}/{repo}/contents/{path}
   → 現在の sha と base64 content を取得
2. base64 デコード → JSON パース
3. history に新レコード追加（冪等性: 同日付レコードがあればスキップ）
4. JSON → base64 エンコード
5. PUT /repos/{owner}/{repo}/contents/{path}
   body: { message, content, sha, branch }
```

### コミットメッセージ

```
chore(prices): update {category}/{modelId} for YYYY-MM-DD
```

## レート制限と再試行

- 指数バックオフで最大 3 回リトライ（1s, 4s, 9s）
- 3 回失敗時は `null` レコード記録 + 通知
- 通知先: Cloudflare Logpush または Email（Phase 2 で決定）

## 秘密情報の取り扱い

| 情報 | ローカル | Workers | CI |
|---|---|---|---|
| RAKUTEN_APP_ID | `.dev.vars` | `wrangler secret` | GitHub Actions Secret |
| YAHOO_CLIENT_ID | `.dev.vars` | `wrangler secret` | GitHub Actions Secret |
| GITHUB_TOKEN | `.dev.vars` | `wrangler secret` | 使用不可（Workers 専用） |

`.dev.vars` は `.gitignore` 済み。コミット禁止。

## 失敗時の観測性

- すべての外部 API 呼び出しに `console.log` で `{ api, status, latency }` を記録
- Cloudflare Workers Analytics でエラー率を可視化
- 週次で手動確認（Phase 2 で自動化検討）

## レート制限対応パターン

```ts
async function fetchWithRetry(
  url: string,
  attempt = 1,
): Promise<Response> {
  const res = await fetch(url);
  if (res.status === 429 && attempt < 3) {
    await sleep(attempt ** 2 * 1000);
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}
```

## 規約遵守

- **価格.com のスクレイピング禁止**
- **メーカー公式サイトのスクレイピング禁止**（機種マスタは手動整備）
- 楽天・Yahoo! の利用規約変更を四半期ごとにレビュー
- API レスポンスの商用利用条件を事前確認（アフィリエイト経由での表示は OK）

## 将来追加候補（Phase 3+）

- Amazon PA-API（売上実績が出てから申請）
- メーカー公式の在庫・価格 API（提携後）
- ヨドバシ・ビック等の量販店 API（非公開、ユーザー投稿で代替検討）
