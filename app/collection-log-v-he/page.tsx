import Link from "next/link";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type VHeKeywordRow = {
  term: string;
  category: string;
  score: number | null;
  mentions: string | null;
  source: string | null;
  rank: number | null;
  runId: number;
  capturedAt: string;
  summary: string | null;
};

type ApiCallLogEntry = { api: string; calledAt: string };

type VHeRun = {
  id: number;
  geo: string;
  startedAt: string;
  finishedAt: string | null;
  rawSignalCount: number | null;
  keywordCount: number | null;
  apiCallLog: ApiCallLogEntry[] | null;
};

type VHeApiResponse = {
  configured: boolean;
  runs: VHeRun[];
  latestRunId: number | null;
  keywords: VHeKeywordRow[];
};

// 페이지는 DB를 직접 조회하지 않고 백엔드 API(GET /api/admin/collect/pipeline-v-he)에서 값을 가져온다.
async function fetchLatestCollection(): Promise<VHeApiResponse> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const empty: VHeApiResponse = { configured: false, runs: [], latestRunId: null, keywords: [] };

  try {
    const response = await fetch(`${base}/api/admin/collect/pipeline-v-he`, { cache: "no-store" });
    if (!response.ok) {
      return empty;
    }
    return response.json();
  } catch {
    // 네트워크 실패(다른 포트·프로덕션·API 미기동 등)에도 500 대신 빈 상태로 렌더한다.
    return empty;
  }
}

function summarizeApiCallLog(log: ApiCallLogEntry[] | null) {
  if (!log || log.length === 0) return [];

  const byApi = new Map<string, { count: number; first: string; last: string }>();
  for (const entry of log) {
    const existing = byApi.get(entry.api);
    if (!existing) {
      byApi.set(entry.api, { count: 1, first: entry.calledAt, last: entry.calledAt });
    } else {
      existing.count += 1;
      existing.last = entry.calledAt;
    }
  }

  return [...byApi.entries()]
    .map(([api, stat]) => ({ api, ...stat }))
    .sort((a, b) => a.first.localeCompare(b.first));
}

export default async function CollectionLogVHePage() {
  const { configured, runs, latestRunId, keywords: rows } = await fetchLatestCollection();

  const latestRows = latestRunId ? rows.filter((row) => row.runId === latestRunId) : rows;
  const maxScore = Math.max(1, ...latestRows.map((row) => row.score ?? 0));
  const latestRun = runs.find((run) => run.id === latestRunId);
  const apiCallSummary = summarizeApiCallLog(latestRun?.apiCallLog ?? null);

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>← 홈으로</Link>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>Pipeline V-HE · Collection Log</p>
          <h1 className={styles.title}>bottom-up 파이프라인 수집 기록</h1>
          <p className={styles.subtitle}>
            YouTube 인기영상(제목·태그·댓글)에서 후보를 발굴하고 Google Trends로 교차확인하는
            v-he 파이프라인의 실행 이력과 최신 랭킹입니다.
          </p>
        </div>
        <span className={styles.countBadge}>총 {rows.length}건 수집</span>
      </div>

      {configured && runs.length > 0 && (
        <>
          <div className={styles.runStrip}>
            {runs.map((run) => (
              <div key={run.id} className={`${styles.runCard} ${run.id === latestRunId ? styles.active : ""}`}>
                <div className={styles.runCardTitle}>
                  <span className={`${styles.runDot} ${!run.finishedAt ? styles.pending : ""}`} />
                  RUN #{run.id} · {run.geo}
                </div>
                <div className={styles.runMeta}>
                  {new Date(run.startedAt).toLocaleString("ko-KR")}
                  <br />
                  원문 신호 {run.rawSignalCount ?? "-"}건 · 키워드 {run.keywordCount ?? "-"}건
                  {!run.finishedAt && " · 진행 중"}
                </div>
              </div>
            ))}
          </div>
          <p className={styles.runHint}>
            원문 신호 상세는 <code>npm run report:v-he</code>로 확인할 수 있습니다.
          </p>
        </>
      )}

      {apiCallSummary.length > 0 && (
        <div className={styles.apiLog}>
          <p className={styles.kicker}>API 호출 기록 (최신 실행, 임시)</p>
          <div className={styles.apiLogTableWrap}>
            <table className={styles.apiLogTable}>
              <thead>
                <tr>
                  <th>API</th>
                  <th>호출 횟수</th>
                  <th>첫 호출</th>
                  <th>마지막 호출</th>
                </tr>
              </thead>
              <tbody>
                {apiCallSummary.map((stat) => (
                  <tr key={stat.api}>
                    <td>{stat.api}</td>
                    <td>{stat.count}회</td>
                    <td>{new Date(stat.first).toLocaleTimeString("ko-KR")}</td>
                    <td>{new Date(stat.last).toLocaleTimeString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!configured ? (
        <div className={styles.empty}>DATABASE_URL을 설정하면 수집 기록이 표시됩니다.</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>
          아직 수집된 키워드가 없습니다. <code>POST /api/admin/collect/pipeline-v-he</code>로 수집을 시작해 주세요.
        </div>
      ) : (
        <div className={styles.grid}>
          {latestRows.map((row, index) => {
            const score = row.score ?? 0;
            const fillWidth = Math.max(6, Math.round((score / maxScore) * 100));
            return (
              <div key={`${row.term}-${row.capturedAt}-${index}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={`${styles.rankBadge} ${row.rank && row.rank <= 3 ? styles.top : ""}`}>
                    {row.rank ?? "-"}
                  </span>
                  <div>
                    <div className={styles.term}>{row.term}</div>
                    <span className={styles.category}>{row.category}</span>
                  </div>
                </div>
                <div className={styles.scoreRow}>
                  <span className={styles.scoreValue}>{score}</span>
                  <span className={styles.scoreLabel}>점 · {row.mentions ?? "-"}</span>
                </div>
                <div className={styles.scoreBar}>
                  <div className={styles.scoreBarFill} style={{ width: `${fillWidth}%` }} />
                </div>
                <span className={styles.sourcePill}>{row.source ?? "-"}</span>
                <p className={styles.summary}>{row.summary ?? "요약 없음"}</p>
                <span className={styles.capturedAt}>{new Date(row.capturedAt).toLocaleString("ko-KR")}</span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
