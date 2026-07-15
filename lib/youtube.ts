const BASE = "https://www.googleapis.com/youtube/v3";

export const trendCategories = [
  { id: "26", label: "뷰티/패션" },
  { id: "19", label: "여행" },
  { id: "28", label: "테크" },
  { id: "22", label: "라이프스타일" },
  { id: "24", label: "엔터테인먼트" },
] as const;

export type TrendVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  categoryId: string;
  categoryLabel: string;
  thumbnail: string;
  tags: string[];
  viewCount: number;
  likeCount: number | null;
  publishedAt: string;
  hoursSincePublished: number;
  viewsPerHour: number;
};

export type VideoComment = {
  text: string;
  likeCount: number;
};

export type SearchVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
};

export function isYoutubeConfigured() {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

async function callYoutube(
  path: string,
  params: Record<string, string>,
  revalidateSeconds: number
) {
  const url = new URL(`${BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY ?? "");

  const res = await fetch(url, { next: { revalidate: revalidateSeconds } });

  if (!res.ok) {
    const body = await res.text();
    console.error(`YouTube API ${path} failed (${res.status}): ${body.slice(0, 300)}`);
    return null;
  }

  return res.json();
}

function toTrendVideo(item: any, categoryLabel: string): TrendVideo {
  const viewCount = Number(item.statistics?.viewCount ?? 0);
  const publishedAt = item.snippet.publishedAt;
  const hoursSincePublished = Math.max(
    (Date.now() - new Date(publishedAt).getTime()) / 3_600_000,
    1
  );

  return {
    videoId: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    categoryId: item.snippet.categoryId,
    categoryLabel,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? "",
    tags: item.snippet.tags ?? [],
    viewCount,
    likeCount: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null,
    publishedAt,
    hoursSincePublished,
    viewsPerHour: Math.round(viewCount / hoursSincePublished),
  };
}

export async function fetchMostPopular(
  categoryId?: string,
  categoryLabel = "전체"
): Promise<TrendVideo[]> {
  const params: Record<string, string> = {
    part: "snippet,statistics",
    chart: "mostPopular",
    regionCode: "KR",
    maxResults: "12",
  };

  if (categoryId) {
    params.videoCategoryId = categoryId;
  }

  const body = await callYoutube("videos", params, 1800);

  if (!body?.items) {
    return [];
  }

  return body.items.map((item: any) => toTrendVideo(item, categoryLabel));
}

export async function fetchRelatedVideos(query: string): Promise<SearchVideo[]> {
  const body = await callYoutube(
    "search",
    {
      part: "snippet",
      q: query,
      regionCode: "KR",
      type: "video",
      order: "viewCount",
      publishedAfter: new Date(Date.now() - 7 * 24 * 3_600_000).toISOString(),
      maxResults: "6",
    },
    21600
  );

  if (!body?.items) {
    return [];
  }

  return body.items.map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? "",
    publishedAt: item.snippet.publishedAt,
  }));
}

export async function fetchTopComments(videoId: string): Promise<VideoComment[]> {
  const body = await callYoutube(
    "commentThreads",
    {
      part: "snippet",
      videoId,
      order: "relevance",
      textFormat: "plainText",
      maxResults: "50",
    },
    1800
  );

  // 댓글이 비활성화된 영상은 403이 반환되므로 조용히 빈 배열 처리
  if (!body?.items) {
    return [];
  }

  return body.items.map((item: any) => {
    const snippet = item.snippet.topLevelComment.snippet;
    return {
      text: snippet.textOriginal ?? snippet.textDisplay ?? "",
      likeCount: Number(snippet.likeCount ?? 0),
    };
  });
}

export function extractSearchQuery(title: string) {
  const cleaned = title
    .replace(/[\[\](){}|#/·…‘’“”'"]/g, " ")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.split(" ").slice(0, 3).join(" ");
}

export function formatViews(count: number) {
  if (count >= 100_000_000) {
    return `${(count / 100_000_000).toFixed(1)}억`;
  }
  if (count >= 10_000) {
    return `${(count / 10_000).toFixed(1)}만`;
  }
  return count.toLocaleString("ko-KR");
}

export function formatHoursAgo(hours: number) {
  if (hours < 24) {
    return `${Math.round(hours)}시간 전`;
  }
  return `${Math.round(hours / 24)}일 전`;
}
