# 外部 API 連携仕様

## 楽天ウェブサービス（商品検索 API）

> **2026-02-10 全面リプレース対応版**（spec: `20260429-rakuten-api-2026-migration`）。旧 `app.rakuten.co.jp` は **2026-05-13 完全停止**。本プロジェクトは新仕様のみサポートし、旧仕様コードは保持しない。

- **エンドポイント**: `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401`
- **認証**: `applicationId`（UUID 形式）+ `accessKey`（`pk_` 始まり）の **両方必須**
- **必須ヘッダ**: `Referer` および `Origin`（無いと 403 `REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING`）
- **レスポンス形式**: `formatVersion=2` を指定。トップレベルキーは `Items`（大文字 I、公式ドキュメント文中の小文字 `items` 表記とは異なる。2026-04-29 ライブ検証で確認）、内側は `Item` ラッパーが除去されたフラット構造（旧仕様の `Items[].Item.*` 二重ネストは廃止）
- **レート制限**: 公式は明記なし（"多くのアクセスがある場合、固定期間応答不可になる場合がある"）。本プロジェクトは安全側で 1 秒 1 リクエストを維持
- **秘密保管**: `RAKUTEN_APP_ID` と `RAKUTEN_ACCESS_KEY` を Wrangler Secret。`RAKUTEN_REFERER` は公開設定として `wrangler.toml [vars]` に置く

### 利用方針

- `keyword` には `"<ブランド表示名> <品番>"` を組み立てて精度を上げる（例: `パナソニック NA-LX129DL`）
- `hits=5` で上位 5 件取得、最安値と平均値を算出
- `minPrice`（カテゴリごとの実機相場下限、`CATEGORY_PRICE_FLOOR`）で部品・取説等の混入を排除
- エラー時は `null` を記録（レコード自体は作成、Yahoo! 単独で成立）
- 4xx 受領時は Workers ログに `event: rakuten.api_4xx` を 1 行残す（applicationId は先頭 4 文字までマスク）。silent 失敗の再発防止

### 取得パラメータ例

```
keyword=パナソニック NA-LX129DL
hits=5
sort=+itemPrice
applicationId=${RAKUTEN_APP_ID}
accessKey=${RAKUTEN_ACCESS_KEY}
formatVersion=2
format=json
minPrice=50000
```

```
Headers:
  User-Agent: kaden-kaimi-bot/0.1 (+https://kaden-kaimi.pages.dev/)
  Referer: https://kaden-kaimi.pages.dev/
  Origin:  https://kaden-kaimi.pages.dev/
```

### 旧仕様（参考・2026-05-13 廃止）

旧 `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706` は `applicationId`（20 桁の数字）単独認証、`Items[].Item.itemPrice` の二重ネスト構造。新 UUID 形式の applicationId を旧 endpoint に渡すと `400 specify valid applicationId` で拒否される。

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
| RAKUTEN_ACCESS_KEY | `.dev.vars` | `wrangler secret` | GitHub Actions Secret |
| RAKUTEN_REFERER | `wrangler.toml [vars]` | `wrangler.toml [vars]` | 公開可・secret 不要 |
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
