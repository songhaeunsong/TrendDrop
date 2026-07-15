import { tokenize } from "@/lib/keyword-extract";
import type { TrendVideo } from "@/lib/youtube";

export type ChannelRec = {
  channelTitle: string;
  videoCount: number;
  totalViewsPerHour: number;
  topVideo: TrendVideo;
};

export type RelatedKeyword = {
  term: string;
  sharedVideos: number;
};

// 영상별 키워드 집합 (제목 + 태그, 소문자 정규화)
export function buildVideoTermIndex(videos: TrendVideo[]) {
  const index = new Map<string, Set<string>>();

  for (const video of videos) {
    const terms = new Set<string>();
    for (const token of tokenize(video.title)) {
      terms.add(token.toLowerCase());
    }
    for (const tag of video.tags) {
      for (const token of tokenize(tag)) {
        terms.add(token.toLowerCase());
      }
    }
    index.set(video.videoId, terms);
  }

  return index;
}

export function videosForKeyword(
  videos: TrendVideo[],
  index: Map<string, Set<string>>,
  keyword: string
) {
  const key = keyword.toLowerCase();
  return videos
    .filter((video) => index.get(video.videoId)?.has(key))
    .sort((a, b) => b.viewsPerHour - a.viewsPerHour);
}

// 같은 영상에 함께 등장한 키워드 = 연관 키워드 (동시출현 기반)
export function relatedKeywords(
  videos: TrendVideo[],
  index: Map<string, Set<string>>,
  keyword: string,
  limit = 10
): RelatedKeyword[] {
  const key = keyword.toLowerCase();
  const matches = videosForKeyword(videos, index, keyword);
  const counts = new Map<string, number>();

  for (const video of matches) {
    for (const term of index.get(video.videoId) ?? []) {
      if (term !== key) {
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([term, sharedVideos]) => ({ term, sharedVideos }))
    .sort((a, b) => b.sharedVideos - a.sharedVideos)
    .slice(0, limit);
}

// 인기 목록에 반복 등장하거나 확산이 빠른 채널
export function risingChannels(videos: TrendVideo[], limit = 8): ChannelRec[] {
  const byChannel = new Map<string, TrendVideo[]>();

  for (const video of videos) {
    const list = byChannel.get(video.channelTitle) ?? [];
    list.push(video);
    byChannel.set(video.channelTitle, list);
  }

  return [...byChannel.entries()]
    .map(([channelTitle, channelVideos]) => {
      const sorted = [...channelVideos].sort((a, b) => b.viewsPerHour - a.viewsPerHour);
      return {
        channelTitle,
        videoCount: channelVideos.length,
        totalViewsPerHour: channelVideos.reduce((sum, v) => sum + v.viewsPerHour, 0),
        topVideo: sorted[0],
      };
    })
    .sort(
      (a, b) =>
        b.videoCount - a.videoCount || b.totalViewsPerHour - a.totalViewsPerHour
    )
    .slice(0, limit);
}

// 누적 조회수는 아직 낮지만 확산 속도가 빠른 영상 = 남들보다 먼저 볼 만한 것
export function hiddenRisers(videos: TrendVideo[], limit = 6) {
  const sortedViews = [...videos].map((v) => v.viewCount).sort((a, b) => a - b);
  const median = sortedViews[Math.floor(sortedViews.length / 2)] ?? 0;

  return videos
    .filter((video) => video.viewCount < median && video.hoursSincePublished <= 72)
    .sort((a, b) => b.viewsPerHour - a.viewsPerHour)
    .slice(0, limit);
}

export type EarlyKeyword = {
  term: string;
  videoCount: number;
  topViewsPerHour: number;
};

// 예비 급상승 키워드: 조회수는 낮지만 빠르게 크는 영상들에서 나온 키워드
export function earlyKeywords(
  videos: TrendVideo[],
  index: Map<string, Set<string>>,
  limit = 10
): EarlyKeyword[] {
  const risers = hiddenRisers(videos, 15);
  const acc = new Map<string, { videoCount: number; topViewsPerHour: number }>();

  for (const video of risers) {
    for (const term of index.get(video.videoId) ?? []) {
      const entry = acc.get(term) ?? { videoCount: 0, topViewsPerHour: 0 };
      entry.videoCount += 1;
      entry.topViewsPerHour = Math.max(entry.topViewsPerHour, video.viewsPerHour);
      acc.set(term, entry);
    }
  }

  return [...acc.entries()]
    .map(([term, entry]) => ({ term, ...entry }))
    .sort(
      (a, b) =>
        b.videoCount - a.videoCount || b.topViewsPerHour - a.topViewsPerHour
    )
    .slice(0, limit);
}

export type CategoryKeywords = {
  category: string;
  terms: string[];
};

// 카테고리별 추천 키워드: 각 카테고리 인기 영상에서 가장 자주 나온 키워드
export function categoryKeywords(
  videos: TrendVideo[],
  index: Map<string, Set<string>>,
  perCategory = 6
): CategoryKeywords[] {
  const byCategory = new Map<string, Map<string, number>>();

  for (const video of videos) {
    if (video.categoryLabel === "전체") continue;
    const counts = byCategory.get(video.categoryLabel) ?? new Map<string, number>();
    for (const term of index.get(video.videoId) ?? []) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
    byCategory.set(video.categoryLabel, counts);
  }

  return [...byCategory.entries()].map(([category, counts]) => ({
    category,
    terms: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, perCategory)
      .map(([term]) => term),
  }));
}
