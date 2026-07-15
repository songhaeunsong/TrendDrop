# /keywords API 스펙 — 요청과 응답 예시

작성일: 2026-07-15

/keywords 페이지가 사용하는 외부 API 3종의 요청 스펙과 실제 응답 예시를 정리한다. 모든 호출은 서버에서만 일어나며, 브라우저에는 완성된 HTML만 전달된다.

## 1. YouTube — 인기 영상 조회 (videos.list)

### 요청

```
GET https://www.googleapis.com/youtube/v3/videos
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `part` | `snippet,statistics` | 제목·태그·썸네일 + 조회수·좋아요 |
| `chart` | `mostPopular` | 인기 차트 |
| `regionCode` | `KR` | 한국 기준 |
| `videoCategoryId` | `26` 등 (선택) | 미지정 시 전체, 지정 시 카테고리별 |
| `maxResults` | `12` | 페이지당 결과 수 |
| `key` | API 키 | 서버 환경변수 `YOUTUBE_API_KEY` |

- 쿼터 비용: **1 unit**
- 캐시: 30분 (`next.revalidate: 1800`)
- 호출 수: 전체 1회 + 카테고리 5회 = 갱신당 6 units

### 응답 예시 (사용하는 필드만 발췌)

```json
{
  "kind": "youtube#videoListResponse",
  "items": [
    {
      "id": "Ot1wUyuE3Vo",
      "snippet": {
        "publishedAt": "2026-07-13T09:00:00Z",
        "title": "idntt 아이덴티티 ‘Kids Return’ Official MV",
        "channelTitle": "idntt",
        "categoryId": "24",
        "tags": ["idntt", "아이덴티티", "Kids Return", "MV"],
        "thumbnails": {
          "medium": { "url": "https://i.ytimg.com/vi/Ot1wUyuE3Vo/mqdefault.jpg" }
        }
      },
      "statistics": {
        "viewCount": "4935059",
        "likeCount": "8711",
        "commentCount": "1204"
      }
    }
  ]
}
```

### 내부 변환 (`lib/youtube.ts` → `TrendVideo`)

```ts
{
  videoId: "Ot1wUyuE3Vo",
  title: "idntt 아이덴티티 'Kids Return' Official MV",
  channelTitle: "idntt",
  categoryLabel: "엔터테인먼트",
  tags: ["idntt", "아이덴티티", "Kids Return", "MV"],
  viewCount: 4935059,
  likeCount: 8711,
  hoursSincePublished: 53,      // 업로드 후 경과 시간
  viewsPerHour: 93114           // viewCount ÷ 경과 시간 = 확산 속도
}
```

## 2. YouTube — 상위 댓글 조회 (commentThreads.list)

### 요청

```
GET https://www.googleapis.com/youtube/v3/commentThreads
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `part` | `snippet` | 댓글 본문·좋아요 수 |
| `videoId` | `Ot1wUyuE3Vo` | 대상 영상 |
| `order` | `relevance` | 좋아요 많은 댓글 우선 |
| `textFormat` | `plainText` | HTML 태그 없는 원문 |
| `maxResults` | `50` | 댓글 수 |

- 쿼터 비용: **영상당 1 unit**
- 대상: 확산 속도 상위 10개 영상 → 갱신당 10 units
- 댓글 비활성 영상은 `403 commentsDisabled` 반환 → 빈 배열로 스킵

### 응답 예시 (사용하는 필드만 발췌)

```json
{
  "kind": "youtube#commentThreadListResponse",
  "items": [
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textOriginal": "데뷔곡부터 이 퀄리티면 올해 신인상 확정 아니냐",
            "likeCount": 3241,
            "publishedAt": "2026-07-13T10:12:44Z"
          }
        }
      }
    }
  ]
}
```

### 내부 변환 (`VideoComment`)

```ts
{ text: "데뷔곡부터 이 퀄리티면 올해 신인상 확정 아니냐", likeCount: 3241 }
```

## 3. Google Trends — 급등 검색어 RSS

### 요청

```
GET https://trends.google.com/trending/rss?geo=KR
```

- 인증: 불필요 (API 키 없음)
- 비용: 무료
- 캐시: 30분
- 형식: RSS 2.0 XML, 항상 급등 검색어 10개

### 응답 예시 (원본 XML 발췌)

```xml
<item>
  <title>배용준</title>
  <ht:approx_traffic>500+</ht:approx_traffic>
  <pubDate>Wed, 15 Jul 2026 06:00:00 -0700</pubDate>
  <ht:picture>https://encrypted-tbn0.gstatic.com/images?q=...</ht:picture>
  <ht:news_item>
    <ht:news_item_title>&quot;전과자 복귀 무대냐&quot;...호프 VIP 시사회 &apos;시끌&apos;</ht:news_item_title>
    <ht:news_item_url>https://www.mt.co.kr/society/2026/07/14/...</ht:news_item_url>
    <ht:news_item_source>머니투데이</ht:news_item_source>
  </ht:news_item>
</item>
```

- 검색어당 `ht:news_item`이 최대 3개 붙는다 (현재는 첫 번째만 사용)
- 제목에 HTML 엔티티(`&quot;` 등)가 섞여 있어 파싱 시 디코딩한다

### 내부 변환 (`lib/keyword-extract.ts` → `TrendingSearch`)

```ts
{
  term: "배용준",
  traffic: "500+",
  newsTitle: "\"전과자 복귀 무대냐\"...호프 VIP 시사회 '시끌'",
  newsUrl: "https://www.mt.co.kr/society/2026/07/14/...",
  newsSource: "머니투데이"
}
```

## 최종 출력 (`RankedKeyword`)

세 소스를 합산한 페이지 표시용 최종 형태:

```ts
{
  term: "idntt",
  score: 114,                          // 가중치 합산 점수
  mentions: 23,                        // 총 언급 횟수
  sources: ["영상 태그", "영상 제목", "댓글"],
  sample: "idntt 아이덴티티 'Kids Return' Official MV"  // 발견된 맥락
}
```

## 갱신당 쿼터 요약

| 호출 | 횟수 | 비용 |
|---|---|---|
| videos.list (전체 + 카테고리 5) | 6 | 6 units |
| commentThreads.list | 10 | 10 units |
| Trends RSS | 1 | 0 |
| **합계 (30분당)** | | **16 units** |

하루 최대(48회 갱신 시) 768 units — 무료 쿼터 10,000의 약 8%.
