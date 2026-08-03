/**
 * 네이트판 오늘의 톡 랭킹 — HTML 스크래핑. (10~30대 여성 사연·이슈 / trend-collector 이전)
 * 랭킹 페이지 한 장에 제목(50) + 베플(베스트 댓글, 25)이 같이 옴.
 */
import { clean, fetchText } from "./http.mjs";

const URL = "https://pann.nate.com/talk/ranking";
const TITLE_RE = /<h2><a href="\/talk\/\d+"[^>]*>([^<]+)<\/a><\/h2>/g;
const REPLY_RE = /<a href="\/talk\/\d+\/reply\/\d+"[^>]*>([^<]+)<\/a>/g;

export async function collect() {
  const html = await fetchText(URL, "https://pann.nate.com/");
  const out = [];

  let m;
  TITLE_RE.lastIndex = 0;
  while ((m = TITLE_RE.exec(html)) !== null) {
    const text = clean(m[1]);
    if (text) out.push({ source: "natepann", unit: "title", text });
  }
  REPLY_RE.lastIndex = 0;
  while ((m = REPLY_RE.exec(html)) !== null) {
    const text = clean(m[1]);
    if (text) out.push({ source: "natepann", unit: "comment", text });
  }
  return out;
}
