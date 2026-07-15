import Link from "next/link";

import {
  extractSearchQuery,
  fetchMostPopular,
  fetchRelatedVideos,
  formatHoursAgo,
  formatViews,
  isYoutubeConfigured,
  trendCategories,
  type TrendVideo,
} from "@/lib/youtube";

export const revalidate = 1800;

export const metadata = {
  title: "TrendDrop | 트렌드 분석 (Live)",
};

export default async function AnalysisPage() {
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

  const [overall, ...byCategory] = await Promise.all([
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

  const rising = uniqueVideos
    .filter((video) => video.hoursSincePublished <= 72)
    .sort((a, b) => b.viewsPerHour - a.viewsPerHour)
    .slice(0, 8);

  const topRising = rising[0];
  const relatedQuery = topRising ? extractSearchQuery(topRising.title) : null;
  const related = relatedQuery ? await fetchRelatedVideos(relatedQuery) : [];

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
              <p className="brand-sub">트렌드 분석 (Live)</p>
            </div>
          </div>
          <div className="link-cluster">
            <Link className="ghost-button link-button" href="/keywords">
              키워드 랭킹
            </Link>
            <Link className="ghost-button link-button" href="/">
              홈으로
            </Link>
          </div>
        </nav>

        <section className="hero-copy">
          <p className="eyebrow">YOUTUBE DATA API · LIVE</p>
          <h1>YouTube에서 지금 올라오는 한국 트렌드 신호</h1>
          <p className="hero-text">
            YouTube Data API를 직접 조회해 카테고리별 인기 영상, 확산 속도 기반 예비
            급상승, 관련 콘텐츠 묶음을 실데이터로 보여줍니다. 데이터는 30분 단위로
            갱신됩니다. (마지막 갱신: {updatedAt})
          </p>
        </section>
      </header>

      <main className="dashboard">
        <section className="section-heading">
          <div>
            <p className="section-kicker">RISING NOW</p>
            <h2>예비 급상승 — 시간당 조회수가 가장 빠르게 붙는 영상</h2>
          </div>
        </section>

        <section className="trend-grid">
          {rising.map((video, index) => (
            <article className="trend-card" key={video.videoId}>
              <div className="trend-head">
                <div>
                  <div className="trend-rank">#{index + 1}</div>
                  <h3>
                    <a
                      className="video-title-link"
                      href={`https://www.youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {video.title}
                    </a>
                  </h3>
                </div>
                <span className="trend-tag">{video.categoryLabel}</span>
              </div>
              <p className="trend-meta">{video.channelTitle}</p>
              <div className="trend-stats">
                <div className="stat-block">
                  <div className="stat-value">{formatViews(video.viewsPerHour)}/시간</div>
                  <p className="stat-label">확산 속도</p>
                </div>
                <div className="stat-block">
                  <div className="stat-value">{formatViews(video.viewCount)}</div>
                  <p className="stat-label">누적 조회수</p>
                </div>
              </div>
              <p className="trend-source">
                업로드 {formatHoursAgo(video.hoursSincePublished)} · 감지 채널: YouTube
              </p>
            </article>
          ))}
        </section>

        {trendCategories.map((category, index) => (
          <CategorySection
            key={category.id}
            label={category.label}
            videos={byCategory[index]}
          />
        ))}

        {topRising && related.length > 0 && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">RELATED CONTENT</p>
                <h3>
                  관련 콘텐츠 묶음 — 급상승 1위 키워드 &ldquo;{relatedQuery}&rdquo;
                </h3>
              </div>
            </div>
            <ul className="watchlist">
              {related.map((video) => (
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
                    <p className="watch-meta">{video.channelTitle}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function CategorySection({
  label,
  videos,
}: {
  label: string;
  videos: TrendVideo[];
}) {
  if (videos.length === 0) {
    return null;
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">CATEGORY FEED</p>
          <h3>{label} 인기 영상</h3>
        </div>
      </div>
      <ul className="watchlist">
        {videos.slice(0, 6).map((video, index) => (
          <li key={video.videoId}>
            <div className="watch-keyword">
              <strong>
                #{index + 1}{" "}
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
                {video.channelTitle} · 조회수 {formatViews(video.viewCount)} · 업로드{" "}
                {formatHoursAgo(video.hoursSincePublished)}
              </p>
            </div>
            <span className="watch-score">{formatViews(video.viewsPerHour)}/h</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
