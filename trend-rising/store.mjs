/**
 * Postgres 저장 계층 — 모든 데이터가 TrendDrop Postgres 한 곳에 들어간다.
 * 테이블 3개를 이 파일이 담당한다:
 *   rising_raw_items   수집 원문 (1시간 버킷)
 *   popular_runs       인기 랭킹 실행 1건
 *   popular_snapshots  그 실행의 top-N
 *
 * env: DATABASE_URL. 없으면 호출 측에서 저장을 스킵한다.
 */
// postgres는 지연 import — DB를 안 쓰는 경로(스크래핑만)에선 패키지 없어도 동작.
let sqlInstance = null;

async function sql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!sqlInstance) {
    const { default: postgres } = await import("postgres");
    sqlInstance = postgres(process.env.DATABASE_URL, {
      prepare: false,
      max: 5,
      onnotice: () => {}, // "relation already exists" 등 NOTICE 소음 억제
    });
  }
  return sqlInstance;
}

export async function closeDb() {
  if (sqlInstance) await sqlInstance.end();
  sqlInstance = null;
}

/** 수집 원문 테이블 생성(멱등). */
export async function ensureTables() {
  const s = await sql();
  await s`CREATE TABLE IF NOT EXISTS rising_raw_items (
    id           bigserial PRIMARY KEY,
    source       text NOT NULL,
    unit         text NOT NULL,
    text         text NOT NULL,
    text_hash    text NOT NULL,
    meta         jsonb,
    bucket_at    timestamptz NOT NULL,
    collected_at timestamptz NOT NULL,
    UNIQUE (source, text_hash, bucket_at)
  )`;
}

/** 수집 원문 저장. 반환: 새로 저장된 수(중복 제외). */
export async function insertRawItems(rows) {
  if (rows.length === 0) return 0;
  const s = await sql();
  await ensureTables();
  let saved = 0;
  await s.begin(async (tx) => {
    for (const r of rows) {
      const res = await tx`INSERT INTO rising_raw_items
        (source, unit, text, text_hash, meta, bucket_at, collected_at)
        VALUES (${r.source}, ${r.unit}, ${r.text}, ${r.textHash},
                ${r.meta ? tx.json(r.meta) : null}, ${r.bucketAt}, ${r.collectedAt})
        ON CONFLICT (source, text_hash, bucket_at) DO NOTHING`;
      saved += res.count;
    }
  });
  return saved;
}

/**
 * 인기 랭킹용 로더 — 최근 N시간의 원문. (source, unit, text, videoId, meta)
 *
 * 창은 "직전 N개 버킷"이 아니라 "직전 N시간"이다. 수집이 빠진 시간대가 있어도
 * 과거로 더 뻗지 않고 표본만 줄어든다 — "6시간 창"이 실제로 6시간을 뜻하게 된다.
 * 기준점은 now()가 아니라 max(bucket_at): 이번 시각 수집이 실패해도 직전 데이터로
 * 랭킹은 나오게 하되, 호출 측이 기준 시각을 출력해 오래된 데이터를 알아채게 한다.
 */
export async function loadRecentItems(hours = 6) {
  const s = await sql();
  await ensureTables();
  const rows = await s`
    SELECT source, unit, text, meta, bucket_at FROM rising_raw_items
    WHERE bucket_at > (SELECT max(bucket_at) FROM rising_raw_items)
                      - make_interval(hours => ${hours})
    ORDER BY bucket_at, id`;
  return rows.map((r) => ({
    source: r.source,
    unit: r.unit,
    text: r.text,
    videoId: r.meta?.videoId ?? null,
    meta: r.meta ?? null, // viewCount·likeCount·approxTraffic 등 가중 보정용
    bucketAt: new Date(r.bucket_at).toISOString(),
  }));
}

/** 백필용 — 전체 기간 원문을 버킷 순으로. (loadRecentItems와 같은 형식) */
export async function loadAllItems() {
  const s = await sql();
  await ensureTables();
  const rows = await s`SELECT source, unit, text, meta, bucket_at
    FROM rising_raw_items ORDER BY bucket_at, id`;
  return rows.map((r) => ({
    source: r.source,
    unit: r.unit,
    text: r.text,
    videoId: r.meta?.videoId ?? null,
    meta: r.meta ?? null,
    bucketAt: new Date(r.bucket_at).toISOString(),
  }));
}

/** 인기 랭킹 결과 테이블 2개 생성(멱등). rising_* 와 분리해 나란히 비교한다. */
export async function ensurePopularTables() {
  const s = await sql();
  await s`CREATE TABLE IF NOT EXISTS popular_runs (
    id         bigserial PRIMARY KEY,
    ran_at     timestamptz NOT NULL DEFAULT now(),
    bucket_at  timestamptz NOT NULL,
    buckets    int NOT NULL,
    item_count int NOT NULL
  )`;
  // 창 길이(시간). buckets는 그 창 안에 실제로 있던 버킷 수 — 둘을 비교하면
  // 그 시점에 수집이 얼마나 빠졌는지 바로 보인다 (6시간 창에 버킷 4개 = 2회 누락).
  await s`ALTER TABLE popular_runs ADD COLUMN IF NOT EXISTS window_hours int`;
  // LLM 필터가 실제로 걸렸는지. 키 없음·API 오류 시 false로 남아 "이 run은 안 걸렀다"를 구분한다.
  await s`ALTER TABLE popular_runs ADD COLUMN IF NOT EXISTS filtered boolean NOT NULL DEFAULT false`;
  await s`CREATE TABLE IF NOT EXISTS popular_snapshots (
    id        bigserial PRIMARY KEY,
    run_id    bigint NOT NULL REFERENCES popular_runs(id),
    term      text NOT NULL,
    rank      int NOT NULL,
    prev_rank int,
    score     real,
    mentions  int,
    breadth   int,
    sources   jsonb,
    units     jsonb,
    sample    text
  )`;
  // 기준 시각을 스냅샷 행에도 둔다. popular_runs 조인 없이 시간으로 바로 조회하기 위함
  // (예: 최근 6시간 랭킹 = WHERE bucket_at > now() - interval '6 hours').
  await s`ALTER TABLE popular_snapshots ADD COLUMN IF NOT EXISTS bucket_at timestamptz`;
  await s`CREATE INDEX IF NOT EXISTS popular_snapshots_term_idx ON popular_snapshots (term)`;
  await s`CREATE INDEX IF NOT EXISTS popular_snapshots_run_idx ON popular_snapshots (run_id)`;
  await s`CREATE INDEX IF NOT EXISTS popular_snapshots_time_idx ON popular_snapshots (bucket_at DESC, rank)`;
}

/**
 * LLM 판정 캐시 — term 하나당 한 행. 같은 단어를 두 번 묻지 않기 위한 장치다.
 * (창이 6시간인데 1시간씩만 밀려서, 연속한 두 실행의 후보가 85% 겹친다.)
 */
export async function ensureVerdictTable() {
  const s = await sql();
  await s`CREATE TABLE IF NOT EXISTS popular_term_verdicts (
    term       text PRIMARY KEY,
    keep       boolean NOT NULL,
    canonical  text,          -- 병합·복원된 이름. 그대로면 null
    category   text,
    reason     text,
    sample     text,          -- 판정 근거가 된 예문 (나중에 판정을 재검토할 때 필요)
    model      text,
    decided_at timestamptz NOT NULL DEFAULT now()
  )`;
}

/** 주어진 term들의 캐시된 판정. 반환: Map<term, verdict>. */
export async function loadVerdicts(terms) {
  if (terms.length === 0) return new Map();
  const s = await sql();
  await ensureVerdictTable();
  const rows = await s`SELECT term, keep, canonical, category, reason
    FROM popular_term_verdicts WHERE term = ANY(${terms})`;
  return new Map(rows.map((r) => [r.term, r]));
}

/** 판정 저장(업서트). 같은 term을 다시 판정하면 덮어쓴다. */
export async function saveVerdicts(verdicts, model) {
  if (verdicts.length === 0) return 0;
  const s = await sql();
  await ensureVerdictTable();
  await s.begin(async (tx) => {
    for (const v of verdicts) {
      await tx`INSERT INTO popular_term_verdicts
        (term, keep, canonical, category, reason, sample, model)
        VALUES (${v.term}, ${v.keep}, ${v.canonical ?? null}, ${v.category ?? null},
                ${v.reason ?? null}, ${v.sample ?? null}, ${model})
        ON CONFLICT (term) DO UPDATE SET
          keep = EXCLUDED.keep, canonical = EXCLUDED.canonical,
          category = EXCLUDED.category, reason = EXCLUDED.reason,
          sample = EXCLUDED.sample, model = EXCLUDED.model, decided_at = now()`;
    }
  });
  return verdicts.length;
}

/** 인기 랭킹 실행 1건 + top-N 저장. ranked[i] = popular.mjs의 항목. */
export async function savePopularRun(
  { bucketAt, buckets, itemCount, windowHours, filtered = false },
  ranked
) {
  const s = await sql();
  await ensurePopularTables();
  // 직전 run = 가장 마지막에 들어간 run. 백필은 버킷 순으로 삽입하므로 ran_at(now())이
  // 전부 같아도 id 순서면 시간 순서가 된다.
  const prevRows = await s`SELECT term, rank FROM popular_snapshots
    WHERE run_id = (SELECT id FROM popular_runs ORDER BY id DESC LIMIT 1)`;
  const prev = new Map(prevRows.map((r) => [r.term, r.rank]));

  const [run] = await s`INSERT INTO popular_runs
    (bucket_at, buckets, item_count, window_hours, filtered)
    VALUES (${bucketAt}, ${buckets}, ${itemCount}, ${windowHours ?? null}, ${filtered})
    RETURNING id`;
  await s.begin(async (tx) => {
    for (let i = 0; i < ranked.length; i++) {
      const k = ranked[i];
      await tx`INSERT INTO popular_snapshots
        (run_id, bucket_at, term, rank, prev_rank, score, mentions, breadth, sources, units, sample)
        VALUES (${run.id}, ${bucketAt}, ${k.term}, ${i + 1}, ${prev.get(k.term) ?? null},
                ${k.score}, ${k.mentions}, ${k.breadth},
                ${tx.json(k.sources)}, ${tx.json(k.units)}, ${k.sample})`;
    }
  });
  return run.id;
}
