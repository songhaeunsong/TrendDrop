import Link from "next/link";

import { buildKeywordRanking, fetchTrendingSearches } from "@/lib/keyword-extract";
import {
  buildVideoTermIndex,
  categoryKeywords,
  earlyKeywords,
  relatedKeywords,
  videosForKeyword,
} from "@/lib/recommend";
import {
  fetchMostPopular,
  fetchTopComments,
  formatViews,
  isYoutubeConfigured,
  trendCategories,
  type VideoComment,
} from "@/lib/youtube";

export const revalidate = 1800;

export const metadata = {
  title: "TrendDrop | 트렌드 추천 (Live)",
};

export default async function RecommendPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string }>;
}) {
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

  const { keyword: keywordParam } = await searchParams;

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

  const commentTargets = [...uniqueVideos]
    .sort((a, b) => b.viewsPerHour - a.viewsPerHour)
    .slice(0, 10);
  const commentResults = await Promise.all(
    commentTargets.map((video) => fetchTopComments(video.videoId))
  );
  const commentsByVideo = new Map<string, VideoComment[]>(
    commentTargets.map((video, index) => [video.videoId, commentResults[index]])
  );

  const ranking = buildKeywordRanking({
    videos: uniqueVideos,
    commentsByVideo,
    trendingSearches,
    limit: 60,
  });

  const index = buildVideoTermIndex(uniqueVideos);

  // 영상 2개 이상과 연결된 키워드만 선택지로 노출 (추천이 항상 나오도록)
  const selectable = ranking
    .filter((entry) => videosForKeyword(uniqueVideos, index, entry.term).length >= 2)
    .slice(0, 18);

  const selected =
    selectable.find((entry) => entry.term === keywordParam)?.term ??
    (keywordParam && videosForKeyword(uniqueVideos, index, keywordParam).length > 0
      ? keywordParam
      : selectable[0]?.term ?? null);

  const related = selected ? relatedKeywords(uniqueVideos, index, selected) : [];
  const keywordVideos = selected
    ? videosForKeyword(uniqueVideos, index, selected).slice(0, 6)
    : [];
  const early = earlyKeywords(uniqueVideos, index);
  const byCategory2 = categoryKeywords(uniqueVideos, index);

  return (
    <div className="page-shell">
      <header className="hero">
        <nav className="topbar">
          <div className="brand">
            <span className="brand-mark">TD</span>
            <div>
              <p className="brand-name">TrendDrop</p>
              <p className="brand-sub">트렌드 추천 (Live)</p>
            </div>
          </div>
          <div className="link-cluster">
            <Link className="ghost-button link-button" href="/keywords">
              키워드 랭킹
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
          <p className="eyebrow">RECOMMENDATION · LIVE</p>
          <h1>지금 트렌드 기준으로 골라주는 추천</h1>
          <p className="hero-text">
            추가 API 호출 없이, 이미 수집한 인기 영상·키워드 데이터의 동시출현 관계로
            연관 키워드와 콘텐츠를 추천합니다. 키워드를 눌러 바꿔보세요.
          </p>
        </section>
      </header>

      <main className="dashboard">
        <section className="section-heading">
          <div>
            <p className="section-kicker">PICK A TREND</p>
            <h2>관심 가는 트렌드 키워드를 고르세요</h2>
          </div>
          <div className="filter-row">
            {selectable.map((entry) => (
              <Link
                key={entry.term}
                className={`filter-chip link-button ${
                  entry.term === selected ? "active" : ""
                }`}
                href={`/recommend?keyword=${encodeURIComponent(entry.term)}`}
              >
                {entry.term}
              </Link>
            ))}
          </div>
        </section>

        {selected && (
          <section className="insight-layout">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">VIDEOS FOR YOU</p>
                  <h3>&ldquo;{selected}&rdquo; 트렌드 영상 추천</h3>
                </div>
              </div>
              <ul className="watchlist">
                {keywordVideos.map((video) => (
                  <li key={video.videoId}>
                    <div className="watch-keyword">
                      <strong>
                        <a
                          className="video-title-link"
                          href={`https://www.youtube.com/watch?v=${video.videoId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {video.title}
                        </a>
                      </strong>
                      <p className="watch-meta">
                        {video.channelTitle} · {video.categoryLabel} · 조회수{" "}
                        {formatViews(video.viewCount)}
                      </p>
                    </div>
                    <span className="watch-score">
                      {formatViews(video.viewsPerHour)}/h
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">RELATED</p>
                  <h3>이 트렌드를 봤다면 — 연관 키워드</h3>
                </div>
              </div>
              <ul className="watchlist">
                {related.map((entry) => (
                  <li key={entry.term}>
                    <div className="watch-keyword">
                      <strong>
                        <Link
                          className="video-title-link"
                          href={`/recommend?keyword=${encodeURIComponent(entry.term)}`}
                        >
                          {entry.term}
                        </Link>
                      </strong>
                      <p className="watch-meta">
                        같은 영상 {entry.sharedVideos}개에서 함께 등장
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        )}

        <section className="insight-layout">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">EARLY KEYWORDS</p>
                <h3>예비 급상승 키워드 — 낮은 조회수, 빠른 확산에서 발견</h3>
              </div>
            </div>
            <ul className="watchlist">
              {early.map((entry) => (
                <li key={entry.term}>
                  <div className="watch-keyword">
                    <strong>
                      <Link
                        className="video-title-link"
                        href={`/recommend?keyword=${encodeURIComponent(entry.term)}`}
                      >
                        {entry.term}
                      </Link>
                    </strong>
                    <p className="watch-meta">
                      급상승 영상 {entry.videoCount}개에서 등장
                    </p>
                  </div>
                  <span className="watch-score">
                    {formatViews(entry.topViewsPerHour)}/h
                  </span>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">BY CATEGORY</p>
                <h3>카테고리별 추천 키워드</h3>
              </div>
            </div>
            {byCategory2.map((group) => (
              <div key={group.category} className="category-keyword-group">
                <p className="watch-meta">{group.category}</p>
                <div className="filter-row">
                  {group.terms.map((term) => (
                    <Link
                      key={term}
                      className="filter-chip link-button"
                      href={`/recommend?keyword=${encodeURIComponent(term)}`}
                    >
                      {term}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </article>
        </section>
      </main>
    </div>
  );
}
