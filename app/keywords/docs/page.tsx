import fs from "node:fs/promises";
import path from "node:path";

import Link from "next/link";
import ReactMarkdown from "react-markdown";

export const metadata = {
  title: "TrendDrop | 키워드 페이지 만든 방법",
};

export default async function KeywordsDocsPage() {
  const filePath = path.join(process.cwd(), "docs", "keywords-page.md");
  const content = await fs.readFile(filePath, "utf8");

  return (
    <div className="page-shell">
      <header className="hero docs-hero">
        <nav className="topbar">
          <div className="brand">
            <span className="brand-mark">TD</span>
            <div>
              <p className="brand-name">TrendDrop</p>
              <p className="brand-sub">키워드 추출 문서</p>
            </div>
          </div>
          <div className="link-cluster">
            <Link className="ghost-button link-button" href="/keywords">
              키워드 랭킹 보기
            </Link>
            <Link className="ghost-button link-button" href="/">
              홈으로 돌아가기
            </Link>
          </div>
        </nav>
      </header>

      <main className="dashboard">
        <section className="panel docs-panel">
          <div className="panel-heading docs-panel-heading">
            <div>
              <p className="section-kicker">HOW IT WORKS</p>
              <h2>/keywords 페이지 — 텍스트 기반 키워드 추출</h2>
            </div>
          </div>
          <article className="markdown-body">
            <ReactMarkdown>{content}</ReactMarkdown>
          </article>
        </section>
      </main>
    </div>
  );
}
