// ChatGPT のレイヤーシート（透過PNG・縦に複数ストリップ）を自動スライスする。
// 使い方: node slice-sheet.mjs <シート.png> <出力プレフィックス>
//   例: node slice-sheet.mjs sheet-t2.png ../frontend/public/images/terrain/t2
// ストリップ境界は「アルファがほぼ空の行」で検出する。
// 依存: pngjs（npm i pngjs）
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [src, prefix] = process.argv.slice(2);
if (!src || !prefix) {
  console.error('usage: node slice-sheet.mjs <sheet.png> <out-prefix>');
  process.exit(1);
}

const png = PNG.sync.read(fs.readFileSync(src));
const { width: W, height: H, data } = png;

// 行ごとの「中身あり」判定（alpha > 10 のピクセルが 5 個超）
const filled = [];
for (let y = 0; y < H; y++) {
  let n = 0;
  for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 10) n++;
  filled.push(n > 5);
}

// 連続区間 = ストリップ（高さ 10px 未満はゴミとして捨てる）
const strips = [];
let start = -1;
for (let y = 0; y <= H; y++) {
  const f = y < H && filled[y];
  if (f && start < 0) start = y;
  if (!f && start >= 0) {
    if (y - start >= 10) strips.push([start, y - 1]);
    start = -1;
  }
}
console.log(`${src}: ${W}x${H}, ${strips.length} strips`);

strips.forEach(([y0, y1], i) => {
  const h = y1 - y0 + 1;
  const out = new PNG({ width: W, height: h });
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * W) * 4;
    data.copy(out.data, y * W * 4, s, s + W * 4);
  }
  // 完全透明ピクセルの色を0に（ファイル縮小・縁の色滲み防止）
  for (let p = 0; p < out.data.length; p += 4) {
    if (out.data[p + 3] < 8) out.data[p] = out.data[p + 1] = out.data[p + 2] = out.data[p + 3] = 0;
  }
  const file = `${prefix}-strip${i + 1}.png`;
  fs.writeFileSync(file, PNG.sync.write(out));
  console.log(`  ${file}: ${W}x${h} (y=${y0}-${y1})`);
});
