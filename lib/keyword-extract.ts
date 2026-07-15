import type { TrendVideo, VideoComment } from "@/lib/youtube";

export type TrendingSearch = {
  term: string;
  traffic: string;
  newsTitle: string | null;
  newsUrl: string | null;
  newsSource: string | null;
};

export type KeywordSource = "급등 검색어" | "영상 태그" | "영상 제목" | "댓글";

export type RankedKeyword = {
  term: string;
  score: number;
  mentions: number;
  sources: KeywordSource[];
  sample: string | null;
};

const TRENDS_RSS_URL = "https://trends.google.com/trending/rss?geo=KR";

function decodeEntities(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export async function fetchTrendingSearches(): Promise<TrendingSearch[]> {
  const res = await fetch(TRENDS_RSS_URL, { next: { revalidate: 1800 } });

  if (!res.ok) {
    console.error(`Trends RSS failed (${res.status})`);
    return [];
  }

  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  return items.map((item) => {
    const pick = (tag: string) => {
      const raw = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1].trim();
      return raw ? decodeEntities(raw) : null;
    };

    return {
      term: pick("title") ?? "",
      traffic: pick("ht:approx_traffic") ?? "-",
      newsTitle: pick("ht:news_item_title"),
      newsUrl: pick("ht:news_item_url"),
      newsSource: pick("ht:news_item_source"),
    };
  });
}

// 댓글/제목에서 자주 나오지만 트렌드 정보가 없는 일반어
const STOPWORDS = new Set([
  "진짜", "너무", "정말", "완전", "그냥", "근데", "그리고", "하지만", "그래서",
  "저는", "제가", "내가", "나는", "우리", "저도", "나도", "당신", "여러분",
  "오늘", "지금", "요즘", "이제", "아직", "계속", "다시", "매일", "항상",
  "이거", "그거", "저거", "이런", "그런", "저런", "이게", "그게", "뭔가",
  "좋아요", "좋다", "좋아", "좋은", "최고", "대박", "사랑", "감사", "감사합니다",
  "응원", "화이팅", "파이팅", "축하", "행복", "귀엽다", "귀여워", "예쁘다", "예뻐",
  "있는", "없는", "하는", "되는", "같아요", "같은", "같다", "합니다", "했다",
  "때문", "정도", "느낌", "생각", "사람", "얘기", "이야기", "모습", "마음",
  "영상", "채널", "구독", "댓글", "알고리즘", "유튜브", "쇼츠", "보고", "보는",
  "봤는데", "봤어요", "나온", "나왔다", "올려", "올린", "처음", "마지막",
  "다들", "역시", "약간", "많이", "조금", "너무나", "엄청", "되게", "무슨",
  "왜케", "왜이렇게", "어떻게", "어떤", "언제", "어디", "누가", "무엇",
]);

const PARTICLE_SUFFIXES = [
  "에서는", "에서도", "입니다", "습니다", "네요", "세요", "해요", "예요",
  "이에요", "에서", "에게", "한테", "께서", "으로", "이랑", "까지", "부터",
  "처럼", "보다", "마다", "조차", "마저", "은", "는", "이", "가", "을", "를",
  "도", "만", "에", "의", "와", "과", "로", "랑",
];

function stripParticle(token: string) {
  for (const suffix of PARTICLE_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 2) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/[ㅋㅎㅠㅜ]{2,}/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => stripParticle(token.trim()))
    .filter(
      (token) =>
        token.length >= 2 &&
        token.length <= 20 &&
        !/^\d+$/.test(token) &&
        !/^[ㄱ-ㅣ]+$/.test(token) &&
        !STOPWORDS.has(token)
    );
}

// 반응이 큰 영상의 키워드일수록 가중 — 로그 스케일이라 1~3.5배 범위에 머문다
function videoBoost(video: TrendVideo) {
  const velocityBoost = Math.min(Math.log10(video.viewsPerHour + 1), 5) / 2;
  const likeBoost = video.likeCount
    ? Math.min(video.likeCount / 100_000, 0.5)
    : 0;
  return 1 + velocityBoost + likeBoost;
}

type Accumulator = Map<
  string,
  { score: number; mentions: number; sources: Set<KeywordSource>; sample: string | null }
>;

function add(
  acc: Accumulator,
  term: string,
  score: number,
  source: KeywordSource,
  sample: string | null
) {
  const key = term.toLowerCase();
  const entry = acc.get(key) ?? {
    score: 0,
    mentions: 0,
    sources: new Set<KeywordSource>(),
    sample: null,
  };
  entry.score += score;
  entry.mentions += 1;
  entry.sources.add(source);
  entry.sample = entry.sample ?? sample;
  acc.set(key, entry);
}

export function buildKeywordRanking({
  videos,
  commentsByVideo,
  trendingSearches,
  limit = 30,
}: {
  videos: TrendVideo[];
  commentsByVideo: Map<string, VideoComment[]>;
  trendingSearches: TrendingSearch[];
  limit?: number;
}): RankedKeyword[] {
  const acc: Accumulator = new Map();

  // 급등 검색어는 이미 검증된 트렌드 키워드라 가장 높은 가중치
  for (const search of trendingSearches) {
    if (search.term) {
      const traffic = Number(search.traffic.replace(/[^0-9]/g, "")) || 100;
      const trafficBoost = 1 + Math.log10(traffic + 1) / 4;
      add(acc, search.term, 40 * trafficBoost, "급등 검색어", search.newsTitle);
    }
  }

  for (const video of videos) {
    const boost = videoBoost(video);

    for (const tag of video.tags) {
      for (const token of tokenize(tag)) {
        add(acc, token, 6 * boost, "영상 태그", video.title);
      }
    }
    for (const token of tokenize(video.title)) {
      add(acc, token, 3 * boost, "영상 제목", video.title);
    }

    const comments = commentsByVideo.get(video.videoId) ?? [];
    for (const comment of comments) {
      const likeWeight = Math.min(comment.likeCount / 50, 4);
      for (const token of new Set(tokenize(comment.text))) {
        add(acc, token, (1 + likeWeight) * boost, "댓글", video.title);
      }
    }
  }

  return [...acc.entries()]
    .map(([term, entry]) => ({
      term,
      score: Math.round(entry.score),
      mentions: entry.mentions,
      sources: [...entry.sources],
      sample: entry.sample,
    }))
    .filter((keyword) => keyword.mentions >= 2 || keyword.sources.includes("급등 검색어"))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
