# TrendDrop 통합 스키마 기준 API 명세

> **소스**: `db/unified-schema.ts`(실제 코드)와 `docs/feature-checklist.md`(화면별 기능 리스트)를
> 다시 대조해서 작성한 문서입니다. 기존 [trend-data-schema-and-api-spec.md](trend-data-schema-and-api-spec.md)와
> 목적은 같지만, 그 문서는 **설계 산문**을 코드보다 먼저 쓴 탓에 실제 `db/unified-schema.ts`와
> 두 군데 어긋나 있었습니다(아래 0절). 이 문서는 코드를 1차 근거로 삼아 그 어긋남을 바로잡고,
> `feature-checklist.md`가 요구하는 엔드포인트를 빠짐없이 담았는지 확인한 버전입니다.
>
> 이 문서도 **설계안(target spec)**이며, 실제 구현 상태는 기존 문서 6절 "현재 구현 상태" 표를 함께 참고하세요.

---

## 0. 스키마 검토 메모 — 이번에 발견한 불일치

기존 문서와 `db/unified-schema.ts`를 컬럼 단위로 다시 대조하면서 찾은 실제 차이입니다. 둘 다 코드가 문서보다
"더 나간" 케이스라 **어느 쪽이 맞는지 팀 결정이 필요**합니다.

| # | 항목 | 코드(`db/unified-schema.ts`) | 기존 문서 | 이 문서의 처리 |
| - | ---- | ----------------------------- | --------- | -------------- |
| 1 | `trend_snapshots.source_id` | `sourceId: integer("source_id").references(() => sources.id)` 컬럼이 **존재함** | 2.6절에 "한 키워드가 여러 소스에서 동시에 잡히는 게 정상이라 대표 소스 하나를 FK로 고를 기준이 없다"며 **컬럼을 두지 않기로 명시적으로 설명**함 | 아래 3.3절 응답에 `sourceId`를 넣지 않음(문서의 논리를 따름). 컬럼 자체를 스키마에서 뺄지, 아니면 "복수 소스 중 하나를 대표로 남기는 용도"로 의미를 재정의할지는 **별도 결정 필요** — 지금 상태로는 죽은 컬럼(dead column)입니다. |
| 2 | `users` 테이블 | `id`, `email`, `created_at` **3개 컬럼뿐** | 2.9절 및 이전에 그린 ERD 아티팩트는 `password_hash`/`name`/`email_verified_at`/`updated_at`까지 포함한 7개 컬럼으로 설계함 | 6절에 "인증 관련 컬럼 미구현"으로 명시하고, 아래 3.6 워치리스트 API를 "로그인 붙기 전"과 "붙은 후" 두 단계로 나눠 기술 |

> ⚠️ 참고로 (1)의 오류는 제가 앞서 만든 ERD 아티팩트(`db/unified-schema.ts`를 "그대로 시각화"했다고 설명한 것)에는
> 반영돼 있지 않았고(트리 상 누락), (2)는 반대로 실제 코드에 없는 컬럼을 있는 것처럼 그렸습니다. 두 경우 모두
> 이 문서 작성 과정에서 코드를 다시 직접 읽고 바로잡았습니다.

---

## 1. 커버리지 확인 — `feature-checklist.md` 요구 항목 ↔ 이 문서 엔드포인트

`feature-checklist.md`의 각 🟡 항목이 요구하는 "실데이터 연동 경로"를 모두 아래 엔드포인트로 커버합니다.

| feature-checklist.md 항목 | 필요 엔드포인트 | 이 문서 절 |
| -------------------------- | ---------------- | ---------- |
| 1.1 랭킹 리스트(탭 전환·카테고리 필터·요약 통계·FLIP·스파크라인·등락 배지·호버 프리뷰) | `GET /api/trends` | 3.2 |
| 1.1 홈 상단 실시간 하이라이트 티커 | `GET /api/trends`의 `meta.ticker` | 3.2 |
| 1.1 타임머신/타임랩스(과거 시점 이동) | `GET /api/keywords/:slug/history` 또는 시점별 `GET /api/trends?runId=` (2단계, 아래 3.2 비고) | 3.2, 3.4 |
| 1.3 워치리스트 패널 | `GET`/`POST`/`DELETE /api/watchlist` | 3.6 |
| 2.1 히트맵 | `GET /api/explore/heatmap` | 3.5 |
| 2.2 키워드 A/B 비교 | `GET /api/keywords/:slug/history` | 3.4 |
| 3 트렌드 상세(히어로·핵심지표·스파크라인·AI요약·연관 키워드·감지 채널) | `GET /api/keywords/:slug` | 3.3 |
| 3 근거 타임라인, 출처 카드 원문 발췌 | **엔드포인트 없음 — 스키마 자체가 없음(아래 4절)** | 4 |
| 카테고리 탭/히트맵 행 순서 | `GET /api/categories` | 3.1 |

누락 없이 전부 매핑됩니다. 유일하게 빠지는 건 애초에 스키마 설계가 안 된 "근거 타임라인"과 "원문 발췌"인데, 이건
엔드포인트를 만들 수 없는 게 아니라 **저장할 컬럼이 없어서** 못 만드는 상태입니다(4절 참고).

---

## 2. 응답 공통 규칙

- 모든 성공 응답은 `{ data, meta? }` 형태.
- `meta.updatedAt`은 응답에 포함된 데이터의 최신 갱신 시각(ISO 8601).
- 에러는 공통 포맷: `{ "error": "사람이 읽는 메시지", "detail": "원인(선택)" }`
- 상태 코드: `400`(요청 오류) · `404`(대상 없음) · `401`(인증 실패, 워치리스트·admin API) · `500`(서버 오류)

---

## 3. 엔드포인트

### 3.1 `GET /api/categories`

DB 소스: `categories` 전체, `sort_order` 오름차순.

```json
{
  "data": [
    { "name": "전체", "slug": "all", "sortOrder": 0 },
    { "name": "푸드", "slug": "food", "sortOrder": 1 }
  ]
}
```

사용 화면: 홈 카테고리 탭, `/explore` 히트맵 행 순서

### 3.2 `GET /api/trends?period=realtime|daily&category=&limit=30`

DB 소스: 가장 최근 `collection_runs.id`(=`runId`) 한 건에 속한 `trend_snapshots`를 `rank` 순으로 조회하고,
`keywords`/`categories`를 조인.

```json
{
  "data": [
    {
      "rank": 1,
      "keyword": "제로슈가 아이스티",
      "slug": "zero-sugar-ice-tea",
      "category": "푸드",
      "previousRank": 2,
      "growth": "+182%",
      "velocity": "9.1/10",
      "score": 88,
      "source": "Instagram Reels, Facebook Groups",
      "summary": "운동 루틴과 다이어트 브이로그에서 반복 노출...",
      "spark": [22, 26, 24, 41, 58, 74, 100]
    }
  ],
  "meta": {
    "period": "realtime",
    "runId": 482,
    "updatedAt": "2026-08-12T05:00:00Z",
    "ticker": [
      { "keyword": "두바이 초콜릿", "kind": "new", "delta": 0 },
      { "keyword": "저속노화 식단", "kind": "surge", "delta": 4 }
    ]
  }
}
```

필드 매핑: `rank`/`score`/`growthRate→growth`/`velocity`는 `trend_snapshots`, `keyword`/`slug`는 `keywords.term`/`slug`,
`category`는 `keywords.category_id`로 조인한 `categories.name`, `source`는 `trend_snapshots.source_label`,
`previousRank`는 직전 `run_id`의 같은 `keyword_id` 순위, `spark`는 최근 7개 `run`의 `score` 시계열.

`meta.ticker`는 이번 `runId`에서 새로 진입(`kind: "new"`)했거나 순위가 급등(`kind: "surge"`, `delta`만큼)한 키워드 목록.

> **타임머신/타임랩스 비고**: 과거 시점 이동은 `runId` 쿼리 파라미터를 추가로 받아(`GET /api/trends?runId=471`)
> 해당 시점 스냅샷을 반환하는 방식을 권장. 별도 엔드포인트를 새로 만들기보다 기존 `/api/trends`를 확장하는 편이
> `meta.ticker` 등 응답 형태를 재사용할 수 있어 더 간단합니다.

사용 화면: 홈 `RankingBoard`

### 3.3 `GET /api/keywords/:slug`

DB 소스: `keywords`(slug로 조회) + 최신 `trend_snapshots` 1건 + `trend_contents`(keyword_id) + `keyword_relations` 조인.

```json
{
  "data": {
    "rank": 1,
    "keyword": "제로슈가 아이스티",
    "category": "푸드",
    "growth": "+182%",
    "velocity": "9.1/10",
    "score": 88,
    "detectedAgo": "2시간 전",
    "updatedAgo": "2시간 전",
    "summary": "운동 루틴과 다이어트 브이로그에서 반복 노출되며...",
    "reasons": [
      {
        "source": "Instagram Reels",
        "text": "\"10초 홈카페\" 포맷 레시피 릴스가 저장 수 상위권에 반복 진입"
      }
    ],
    "series": [22, 26, 24, 41, 58, 74, 100],
    "days": ["월", "화", "수", "목", "금", "토", "일"],
    "related": [
      {
        "platform": "Instagram",
        "title": "제로슈가 홈카페 3종 레시피",
        "metric": "저장 12.4K",
        "kind": "릴스",
        "url": "https://...",
        "thumbnailUrl": "https://..."
      }
    ],
    "keywords": ["#다이어트음료", "#홈카페", "#저칼로리"],
    "channels": ["Instagram Reels", "Facebook Groups", "YouTube Shorts"]
  }
}
```

필드 매핑: `reasons`는 `trend_snapshots.reasons`(jsonb) 그대로, `related`는 `trend_contents`
(`platform←kind`, `metric←metric_label`, `thumbnailUrl←thumbnail_url`), `keywords`(연관 키워드 칩)는
`keyword_relations.related_keyword_id → keywords.term`을 `weight` 내림차순으로. `detectedAgo`는
`keywords.first_seen_at`, `updatedAgo`는 `trend_snapshots.captured_at` 기준 상대 시간.

> **`sourceId`를 응답에 넣지 않는 이유**: 0절 (1)번 참고 — `trend_snapshots.source_id` 컬럼은 스키마에
> 존재하지만 "여러 소스가 동시에 기여"라는 설계 의도와 맞지 않아 API 응답에서는 제외합니다. 소스별 기여는
> `reasons` 배열이 이미 표현합니다.

없는 slug 요청 시: `404 { "error": "keyword not found" }`

사용 화면: `/trend/[slug]` 상세 페이지

### 3.4 `GET /api/keywords/:slug/history?window=12h`

DB 소스: 해당 `keyword_id`의 `trend_snapshots`를 `run_id` 순으로, `window` 시간 범위만큼.

```json
{
  "data": [
    { "runId": 471, "rank": 3, "score": 61 },
    { "runId": 472, "rank": null, "score": 0 },
    { "runId": 473, "rank": 2, "score": 74 }
  ]
}
```

`rank: null`은 해당 시점에 순위권 밖(이탈)을 의미.

사용 화면: `/trend` 스파크라인, `/explore` A/B 비교 차트, 홈 타임머신/타임랩스(3.2 비고)

### 3.5 `GET /api/explore/heatmap?window=12h`

DB 소스: `trend_snapshots`를 `run_id` × `category_id`로 그룹핑해 카테고리별 평균/최대 `score`를 heat(0~100)로 정규화.

```json
{
  "data": {
    "columns": [
      { "runId": 471, "clock": "14:00", "label": "12시간 전", "isLatest": false },
      { "runId": 482, "clock": "지금", "label": "지금", "isLatest": true }
    ],
    "categories": ["푸드", "뷰티", "테크"],
    "matrix": [
      [40, 55, 100],
      [30, 42, 61],
      [20, 38, 45]
    ]
  }
}
```

`matrix[행][열]` = 해당 카테고리·시점의 heat(0~100). `categories` 순서는 `categories.sort_order` 기준.

사용 화면: `/explore` 히트맵

### 3.6 워치리스트

| 엔드포인트 | 설명 | 인증 |
| ---------- | ---- | ---- |
| `GET /api/watchlist` | 저장한 키워드 목록 | 필요 |
| `POST /api/watchlist` `{ keywordSlug }` | 추가 | 필요 |
| `DELETE /api/watchlist/:id` | 삭제 | 필요 |

DB 소스: `watchlist_items`(`user_id`, `keyword_id`) + `keywords` 조인.

> **선행 조건 — 0절 (2)번 참고**: 지금 `users` 테이블엔 `id`/`email`/`created_at`만 있고 비밀번호·세션 관련
> 컬럼이 없어 실제 로그인을 구현할 수 없는 상태입니다. 두 단계로 나눠 접근하는 걸 제안합니다.
> 1. **1단계(최소)**: 로그인 없이 브라우저별 익명 `user_id`(쿠키에 발급한 UUID)만으로 `watchlist_items`를 채움 —
>    `users.password_hash` 등 인증 컬럼 없이 지금 스키마 그대로 가능.
> 2. **2단계(로그인 도입 시)**: `users`에 `password_hash`/`email_verified_at` 등 인증 컬럼을 실제로 추가하고
>    익명 `user_id`를 로그인 계정에 병합.
>
> `feature-checklist.md` 1.3절이 지적한 "홈 워치리스트 패널"과 "랭킹 행 ★ 즐겨찾기(`localStorage`)" 두 UI는
> 이 API 하나로 반드시 통합해야 합니다(중복 저장 UI 금지).

---

## 4. 아직 스키마가 없어서 못 만드는 엔드포인트

| 기능 | 필요한 것 | 상태 |
| ---- | --------- | ---- |
| `/trend` 근거 타임라인(언제 어디서 먼저 터졌는지 시간순 이벤트) | `trend_snapshots`는 run당 1행뿐이라 세분 이벤트 로그를 담을 테이블이 없음. 새 테이블 설계 필요(예: `trend_events(keyword_id, source, detected_at, note)`) | 미설계 |
| 출처 카드 원문 발췌(`excerpt`) | `trend_contents`에 대응 컬럼 없음(`title`/`metric_label`/`thumbnail_url`만 존재). 컬럼 추가 필요 | 미설계 |

두 항목은 API 엔드포인트를 지금 만들어도 채울 데이터가 없으므로, 당분간 프론트에서 합성 데이터로 유지하는 게 맞습니다
(`feature-checklist.md` 3장의 기존 경고와 동일한 결론).

---

## 5. 관리자 API (참고용)

`POST /api/admin/collect/:pipeline` — 이미 구현되어 있고(`app/api/admin/collect/*`), `Authorization: Bearer $CRON_SECRET` 필요.
이 문서의 워치리스트·트렌드 조회 API와 달리 프론트가 직접 호출하지 않으므로 상세 스펙은 다루지 않습니다.

---

## 6. 용어집

| 용어 | 의미 |
| ---- | ---- |
| **run** | 한 번의 수집 실행, 시계열의 "시점" 단위 (`collection_runs.id`) |
| **score** | 0~100 트렌드 점수(정렬·차트 기준값) |
| **rank** | 해당 run 안에서 score로 매긴 순위 |
| **growth / velocity** | 사람이 읽는 표시용 문자열. 계산에 쓰지 말 것 |
| **previousRank** | 직전 run 대비 순위. `null`이면 신규 진입(NEW) |
| **slug** | 키워드/카테고리의 URL 식별자 |
| **ticker** | 홈 상단 신규/급상승 키워드 배너. `GET /api/trends`의 `meta.ticker` |
