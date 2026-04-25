/**
 * Worker 内で利用する共通型定義。
 *
 * 永続化される `PriceRecord`（src/types/schema.ts）とは別レイヤ：
 * `PriceQuote` は個別 API の単発レスポンスを表現する内部型。
 */

export interface PriceQuote {
  /** 検索ヒット中の最安値（円、税込） */
  min: number;
  /** 検索ヒットの平均値（円、税込、四捨五入） */
  avg: number;
  /** 在庫あり商品が 1 件以上含まれるか */
  available: boolean;
  /** 価格が抽出できたヒット件数 */
  hitCount: number;
  /** 最安値の商品コード（後追いで externalIds に書き戻す用） */
  topItemCode: string | null;
}
