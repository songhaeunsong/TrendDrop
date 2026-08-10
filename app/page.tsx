import Onboarding from "@/app/onboarding";
import RankingBoard from "@/app/ranking-board";
import { categories, dailyTrends, watchItems } from "@/lib/trend-data";
import CollectionControls from "@/components/collection-controls";

export default function HomePage() {
  return (
    <div className="page-shell">
      <main className="app-main">
        <Onboarding categories={categories} />

        <RankingBoard daily={dailyTrends} categories={categories} />

        <CollectionControls />

        <section className="panel watchlist-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">WATCHLIST</p>
              <h3>예비 급상승 키워드</h3>
            </div>
          </div>
          <ul className="watchlist">
            {watchItems.map((item) => (
              <li key={item.keyword}>
                <div className="watch-keyword">
                  <strong>{item.keyword}</strong>
                  <p className="watch-meta">{item.meta}</p>
                </div>
                <span className="watch-score">{item.score}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
