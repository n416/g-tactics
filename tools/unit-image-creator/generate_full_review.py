# 全生成済み機体のダメ出し用レビューHTML(check-review.html)を生成する。
# 旧画像と生成画像を並べ、カードをクリックすると上部のテキスト欄にファイル名が追記される。
# 選んだリストをコピーして Claude に貼れば作り直しキューになる。
import csv
from pathlib import Path

PROD = Path(__file__).parent
rows = list(csv.DictReader(open(PROD / "manifest.csv", encoding="utf-8")))

cards = []
for r in rows:
    stem = r["image"].rsplit(".", 1)[0]
    if not (PROD / "out" / f"{stem}.png").exists():
        continue
    if (PROD / "../../frontend/public/images/units" / r["image"]).exists():
        old_rel = f"../../frontend/public/images/units/{r['image']}"
    else:
        old_rel = f"ref2/{stem}.png"  # 旧画像が無い機体はユーザー収集の設定画を表示
    cards.append(f"""
    <div class="card" data-image="{r['image']}" data-name="{r['name']}">
      <div class="imgs">
        <div class="old"><img src="{old_rel}" loading="lazy" alt="old"></div>
        <div class="new"><img src="out/{stem}.png" loading="lazy" alt="new"></div>
      </div>
      <div class="meta">#{r['unit_id']} {r['name']} <span class="file">{r['image']}</span></div>
    </div>""")

html = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<title>ダメ出しレビュー ({len(cards)}機)</title>
<style>
  body {{ background: #222; color: #eee; font-family: sans-serif; margin: 16px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }}
  .card {{ background: #333; border-radius: 8px; padding: 8px; cursor: pointer;
           border: 2px solid transparent; }}
  .card.bad {{ border-color: #e33; background: #433; }}
  .imgs {{ display: flex; gap: 8px; align-items: center; justify-content: center;
           background: repeating-conic-gradient(#555 0% 25%, #666 0% 50%) 0 0 / 24px 24px;
           border-radius: 4px; min-height: 240px; pointer-events: none; }}
  .imgs > div {{ flex: 1; text-align: center; }}
  .old img {{ image-rendering: pixelated; max-width: 100%; max-height: 220px; }}
  .new img {{ max-width: 100%; max-height: 235px; }}
  .meta {{ margin-top: 6px; font-size: 13px; pointer-events: none; }}
  .file {{ color: #999; font-size: 11px; }}
  h1 {{ font-size: 18px; }}
  #panel {{ position: sticky; top: 0; background: #222; padding: 8px 0; z-index: 9;
            border-bottom: 1px solid #444; }}
  textarea {{ width: 100%; height: 90px; background: #111; color: #f88;
              font-family: monospace; font-size: 12px; }}
  #count {{ color: #f88; }}
</style></head><body>
<h1>ダメ出しレビュー — 生成済み {len(cards)}機（左: 旧 / 右: 新）。ダメなカードをクリック → 下の欄に溜まる。もう一度クリックで取り消し</h1>
<div id="panel">
  <div>選択中: <span id="count">0</span>機 <button onclick="copyList()">コピー</button></div>
  <textarea id="list" placeholder="ダメだった機体のファイル名がここに溜まります。コピーしてClaudeに貼ってください"></textarea>
</div>
<div class="grid">{''.join(cards)}</div>
<script>
const listEl = document.getElementById('list');
const countEl = document.getElementById('count');
function refresh() {{
  const bad = [...document.querySelectorAll('.card.bad')];
  listEl.value = bad.map(c => c.dataset.image + "\\t" + c.dataset.name).join("\\n");
  countEl.textContent = bad.length;
}}
document.querySelectorAll('.card').forEach(c => {{
  c.addEventListener('click', () => {{ c.classList.toggle('bad'); refresh(); }});
}});
function copyList() {{ listEl.select(); document.execCommand('copy'); }}
</script>
</body></html>"""

(PROD / "check-review.html").write_text(html, encoding="utf-8")
print("check-review.html written,", len(cards), "units")
