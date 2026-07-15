const apiKey = process.env.YOUTUBE_API_KEY;

if (!apiKey) {
  console.error("YOUTUBE_API_KEY is not configured");
  console.error("Run with: node --env-file=.env.local scripts/youtube-probe.mjs");
  process.exit(1);
}

const BASE = "https://www.googleapis.com/youtube/v3";

async function callApi(name, path, params) {
  const url = new URL(`${BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const body = await res.json();

  if (!res.ok) {
    console.error(`[${name}] failed (${res.status})`);
    console.error(JSON.stringify(body.error, null, 2));
    process.exitCode = 1;
    return null;
  }

  console.log(`\n=== ${name} ===`);
  return body;
}

// 1. videoCategories.list — KR에서 유효한 카테고리 목록 (1 unit)
const categories = await callApi("1. videoCategories.list", "videoCategories", {
  part: "snippet",
  regionCode: "KR",
});

if (categories) {
  for (const item of categories.items) {
    console.log(`  ${item.id}\t${item.snippet.title}\tassignable=${item.snippet.assignable}`);
  }
}

// 2. videos.list chart=mostPopular — KR 인기 영상 (1 unit)
const popular = await callApi("2. videos.list (chart=mostPopular)", "videos", {
  part: "snippet,statistics",
  chart: "mostPopular",
  regionCode: "KR",
  maxResults: "10",
});

const videoIds = [];

if (popular) {
  for (const item of popular.items) {
    videoIds.push(item.id);
    console.log(
      `  [${item.snippet.categoryId}] ${item.snippet.title} — views=${item.statistics.viewCount}`
    );
  }
}

// 3. videos.list id=... — 영상 통계 갱신용 재조회 (1 unit / 최대 50개)
if (videoIds.length > 0) {
  const stats = await callApi("3. videos.list (id=...)", "videos", {
    part: "statistics",
    id: videoIds.join(","),
  });

  if (stats) {
    for (const item of stats.items) {
      console.log(
        `  ${item.id} — views=${item.statistics.viewCount} likes=${item.statistics.likeCount ?? "-"}`
      );
    }
  }
}

// 4. search.list — 키워드 관련 영상 (⚠️ 100 units)
const search = await callApi("4. search.list (q=성수동 팝업)", "search", {
  part: "snippet",
  q: "성수동 팝업",
  regionCode: "KR",
  type: "video",
  order: "viewCount",
  publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  maxResults: "5",
});

if (search) {
  for (const item of search.items) {
    console.log(`  ${item.id.videoId} — ${item.snippet.title} (${item.snippet.channelTitle})`);
  }
}

console.log("\nQuota used by this run: 1 + 1 + 1 + 100 = 103 units (daily free quota: 10,000)");
