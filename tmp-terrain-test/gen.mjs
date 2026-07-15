import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 線形合同法による擬似乱数ジェネレータ（シード固定）
let seed = 12345;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

const N = 80;
const stars = [];

for (let i = 0; i < N; i++) {
  const x = random() * 256;
  const y = random() * 256;
  // 半径: 0.5 〜 2.0
  const r = 0.5 + random() * 1.5;
  // 不透明度: 0.3 〜 1.0
  const opacity = 0.3 + random() * 0.7;
  
  // 色: 白〜薄い青 (色相 200〜240, 彩度 50〜100%, 輝度 80〜100%)
  const hue = 200 + random() * 40;
  const sat = 50 + random() * 50;
  const lit = 80 + random() * 20;
  const fill = `hsl(${Math.round(hue)},${Math.round(sat)}%,${Math.round(lit)}%)`;

  // 8方向の境界チェックと構造的な複製
  for (const dx of [-256, 0, 256]) {
    for (const dy of [-256, 0, 256]) {
      const cx = x + dx;
      const cy = y + dy;
      
      // 円が基本タイル(0 0 256 256)と重なる場合のみ描画
      if (cx + r >= 0 && cx - r <= 256 && cy + r >= 0 && cy - r <= 256) {
        const cxStr = cx.toFixed(1);
        const cyStr = cy.toFixed(1);
        const rStr = r.toFixed(1);
        const opStr = opacity.toFixed(2);
        stars.push(`<circle cx="${cxStr}" cy="${cyStr}" r="${rStr}" fill="${fill}" opacity="${opStr}"/>`);
      }
    }
  }
}

// 自己完結型のSVGコンテンツ構築
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${stars.join('')}</svg>`;

const outPath = path.join(__dirname, 'space.svg');
fs.writeFileSync(outPath, svgContent, 'utf-8');

console.log(`生成完了: ${outPath}`);
console.log(`ファイルサイズ: ${fs.statSync(outPath).size} bytes`);
