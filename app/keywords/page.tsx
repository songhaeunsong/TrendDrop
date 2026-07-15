import Link from "next/link";

import {
  buildKeywordRanking,
  fetchTrendingSearches,
  type KeywordSource,
} from "@/lib/keyword-extract";
import {
  fetchMostPopular,
  fetchTopComments,
  isYoutubeConfigured,
  trendCategories,
  type VideoComment,
} from "@/lib/youtube";

export const revalidate = 1800;

export const metadata = {
  title: "TrendDrop | 텍스트 키워드 랭킹 (Live)",
};

const COMMENT_TARGET_COUNT = 10;

const sourceBadgeClass: Record<KeywordSource, string> = {
  "급등 검색어": "keyword-badge badge-search",
  "영상 태그": "keyword-badge badge-tag",
  "영상 제목": "keyword-badge badge-title",
  댓글: "keyword-badge badge-comment",
};

export default async function KeywordsPage() {
  if (!isYoutubeConfigured()) {
    return (
      <div className="page-shell">
        <main className="dashboard">
          <section className="panel">
            <h2>YOUTUBE_API_KEY가 설정되지 않았습니다</h2>
            <p className="trend-meta">
              .env.local에 YOUTUBE_API_KEY를 추가한 뒤 서버를 재시작해주세요.
            </p>
          </section>
        </main>
      </div>
    );
  }

  const [trendingSearches, overall, ...byCategory] = await Promise.all([
    fetchTrendingSearches(),
    fetchMostPopular(),
    ...trendCategories.map((category) =>
      fetchMostPopular(category.id, category.label)
    ),
  ]);

  const allVideos = [...overall, ...byCategory.flat()];
  const seen = new Set<string>();
  const uniqueVideos = allVideos.filter((video) => {
    if (seen.has(video.videoId)) return false;
    seen.add(video.videoId);
    return true;
  });

  // 확산 속도가 빠른 영상의 댓글이 "지금 반응"을 가장 잘 보여준다
  const commentTargets = [...uniqueVideos]
    .sort((a, b) => b.viewsPerHour - a.viewsPerHour)
    .slice(0, COMMENT_TARGET_COUNT);

  const commentResults = await Promise.all(
    commentTargets.map((video) => fetchTopComments(video.videoId))
  );

  const commentsByVideo = new Map<string, VideoComment[]>(
    commentTargets.map((video, index) => [video.videoId, commentResults[index]])
  );

  const totalComments = commentResults.reduce((sum, list) => sum + list.length, 0);

  const ranking = buildKeywordRanking({
    videos: uniqueVideos,
    commentsByVideo,
    trendingSearches,
  });

  const updatedAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="page-shell">
      <header className="hero">
        <nav className="topbar">
          <div className="brand">
            <span className="brand-mark">TD</span>
            <div>
              <p className="brand-name">TrendDrop</p>
              <p className="brand-sub">텍스트 키워드 랭킹 (Live)</p>
            </div>
          </div>
          <div className="link-cluster">
            <Link className="ghost-button link-button" href="/keywords/docs">
              만든 방법
            </Link>
            <Link className="ghost-button link-button" href="/keywords/spec">
              API 스펙
            </Link>
            <Link className="ghost-button link-button" href="/analysis">
              영상 분석
            </Link>
            <Link className="ghost-button link-button" href="/">
              홈으로
            </Link>
          </div>
        </nav>

        <section className="hero-copy">
          <p className="eyebrow">TEXT SIGNALS · LIVE</p>
          <h1>텍스트에서 뽑아낸 지금 유행하는 키워드</h1>
          <p className="hero-text">
            인기 영상 {uniqueVideos.length}개의 제목·태그, 급상승 영상{" "}
            {commentTargets.length}개의 상위 댓글 {totalComments}개, Google Trends 급등
            검색어 {trendingSearches.length}개를 합쳐 키워드를 추출했습니다. 30분 단위로
            갱신됩니다. (마지막 갱신: {updatedAt})
          </p>
        </section>
      </header>

      <main className="dashboard">
        <section className="section-heading">
          <div>
            <p className="section-kicker">KEYWORD RANKING</p>
            <h2>통합 키워드 랭킹 — 세 텍스트 소스의 교차 신호</h2>
          </div>
        </section>

        <section className="panel">
          <ul className="watchlist">
            {ranking.map((keyword, index) => (
              <li key={keyword.term}>
                <div className="watch-keyword">
                  <strong>
                    #{index + 1} {keyword.term}
                  </strong>
                  <p className="watch-meta">
                    {keyword.sources.map((source) => (
                      <span key={source} className={sourceBadgeClass[source]}>
                        {source}
                      </span>
                    ))}
                    언급 {keyword.mentions}회
                    {keyword.sample ? ` · 예: ${keyword.sample.slice(0, 40)}` : ""}
                  </p>
                </div>
                <span className="watch-score">{keyword.score}점</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">GOOGLE TRENDS RSS</p>
              <h3>지금 급등 중인 검색어 — 뉴스 맥락 포함</h3>
            </div>
          </div>
          <ul className="watchlist">
            {trendingSearches.slice(0, 12).map((search) => (
              <li key={search.term}>
                <div className="watch-keyword">
                  <strong>{search.term}</strong>
                  <p className="watch-meta">
                    {search.newsTitle && search.newsUrl ? (
                      <a
                        className="video-title-link"
                        href={search.newsUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {search.newsTitle}
                        {search.newsSource ? ` (${search.newsSource})` : ""}
                      </a>
                    ) : (
                      "관련 뉴스 없음"
                    )}
                  </p>
                </div>
                <span className="watch-score">검색 {search.traffic}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
