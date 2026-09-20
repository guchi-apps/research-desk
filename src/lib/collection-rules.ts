// 日次収集のうち、DBに触らない判定。`collection.ts`はPrismaをimportするためテストから読めないので、
// テストしたいロジックはここへ置く（`analysis-job-rules.ts`と同じ切り分け）。

/** `industry_information.normalizedUrl`の列幅（`prisma/schema.prisma`の`VarChar(512)`）。 */
export const MAX_NORMALIZED_URL_LENGTH = 512;

/** 正規化後のURLが`normalizedUrl`列に収まるか。超えるとINSERTがP2000で落ちる。 */
export function fitsNormalizedUrlColumn(normalizedUrl: string): boolean {
  return normalizedUrl.length <= MAX_NORMALIZED_URL_LENGTH;
}

export type DailyRunStatus = "SUCCEEDED" | "PARTIAL" | "FAILED";

/**
 * 日次収集の実行結果の状態。フィードが全部取れなかった、または登録しようとした候補が全部失敗した
 * ときだけ`FAILED`にし、一部でも失敗があれば`PARTIAL`、何も失敗していなければ`SUCCEEDED`にする。
 */
export function decideDailyRunStatus(input: { feedCount: number; feedFailures: number; selectedCount: number; articleFailures: number }): DailyRunStatus {
  const { feedCount, feedFailures, selectedCount, articleFailures } = input;
  if (feedFailures >= feedCount) return "FAILED";
  if (selectedCount > 0 && articleFailures >= selectedCount) return "FAILED";
  return feedFailures + articleFailures > 0 ? "PARTIAL" : "SUCCEEDED";
}
