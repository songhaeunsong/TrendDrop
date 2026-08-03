/** 인스티즈 실시간 인기(pt) 제목. HTML 스크래핑. (10~20대 여성 / trend-collector 이전) */
import { clean, fetchText } from "./http.mjs";

const URL = "https://www.instiz.net/pt";
const ITEM_RE = /class="post_title"[^>]*>([^<]+)</g;

/** pt 페이지엔 JS 템플릿 조각(' + item.subject + ')이 섞여 옴 → 제거. */
function isJunk(t) {
  return (
    t.includes("item.") ||
    t.includes("goutdata") ||
    t.includes("subject") ||
    t.includes("+") ||
    t === "-" ||
    t === ""
  );
}

export async function collect() {
  const html = await fetchText(URL, "https://www.instiz.net/");
  const out = [];
  let m;
  ITEM_RE.lastIndex = 0;
  while ((m = ITEM_RE.exec(html)) !== null) {
    const text = clean(m[1]);
    if (isJunk(text)) continue;
    out.push({ source: "instiz", unit: "title", text });
  }
  return out;
}
