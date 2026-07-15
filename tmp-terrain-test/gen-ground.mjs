import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 線形合同法による擬似乱数ジェネレータ（シード固定）
let seed = 999;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

const N = 100; // 敷き詰める葉の数
let originalCount = 0;
let copyCount = 0;

// ベースレイヤーの色（下が透けないようにする）
const baseLayerFill = "#0f1c13"; // 暗い森の土・下地の色

// 葉の形状テンプレート (中心からの角度と距離の比率)
// 楓風、丸い広葉、尖った広葉など複数パターンを用意
const templates = [
  // 楓風 (10頂点)
  [
    {a: 0, d: 1.0}, {a: 40, d: 0.3}, {a: 75, d: 0.8}, {a: 110, d: 0.2},
    {a: 145, d: 0.6}, {a: 180, d: 0.1}, {a: 215, d: 0.6}, {a: 250, d: 0.2},
    {a: 285, d: 0.8}, {a: 320, d: 0.3}
  ],
  // 丸っこい広葉 (8頂点)
  [
    {a: 0, d: 1.0}, {a: 45, d: 0.7}, {a: 90, d: 0.5}, {a: 135, d: 0.3},
    {a: 180, d: 0.1}, {a: 225, d: 0.3}, {a: 270, d: 0.5}, {a: 315, d: 0.7}
  ],
  // 尖った広葉 (6頂点)
  [
    {a: 0, d: 1.0}, {a: 60, d: 0.4}, {a: 120, d: 0.2}, 
    {a: 180, d: 0.1}, {a: 240, d: 0.2}, {a: 300, d: 0.4}
  ]
].map(t => t.map(p => ({ a: p.a * Math.PI / 180, d: p.d })));

// 色のバケット準備
// 枯れ葉から暗い緑まで広葉樹の森をイメージ
const numBuckets = 8;
const buckets = [];
for(let i = 0; i < numBuckets; i++) {
  const h = Math.round(50 + random() * 80); // 50(黄色/茶) 〜 130(緑)
  const s = Math.round(15 + random() * 25); // 彩度は抑えめ
  const l = Math.round(15 + random() * 25); // 明度は低め（文字の可読性のため）
  const opacity = (0.5 + random() * 0.4).toFixed(2);
  
  buckets.push({
    fill: `hsl(${h},${s}%,${l}%)`,
    opacity: opacity,
    paths: []
  });
}

for (let i = 0; i < N; i++) {
  const x = random() * 256;
  const y = random() * 256;
  const r = 20 + random() * 20; // 葉の大きさ (20〜40)
  const angle = random() * Math.PI * 2; // ランダムな向き（流星群を回避）
  
  const tmpl = templates[Math.floor(random() * templates.length)];
  const bucketIndex = Math.floor(random() * numBuckets);
  
  for (const dx of [-256, 0, 256]) {
    for (const dy of [-256, 0, 256]) {
      const cx = x + dx;
      const cy = y + dy;
      
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      
      // 頂点座標の計算
      const pts = tmpl.map(pt => {
        const px = Math.round(cx + Math.cos(pt.a + angle) * r * pt.d);
        const py = Math.round(cy + Math.sin(pt.a + angle) * r * pt.d);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        return { x: px, y: py };
      });
      
      // 境界判定
      if (maxX >= 0 && minX <= 256 && maxY >= 0 && minY <= 256) {
        if (dx === 0 && dy === 0) {
          originalCount++;
        } else {
          copyCount++;
        }
        
        // カンマを省き、スペース区切りでパスを構築してサイズ削減
        let dStr = `M${pts[0].x} ${pts[0].y}`;
        for(let j = 1; j < pts.length; j++) {
          dStr += `L${pts[j].x} ${pts[j].y}`;
        }
        dStr += 'Z';
        buckets[bucketIndex].paths.push(dStr);
      }
    }
  }
}

const totalCount = originalCount + copyCount;
console.log(`葉の総数: ${totalCount}`);
console.log(`うち端の複製として追加された数: ${copyCount}`);
const copyRatio = (copyCount / totalCount) * 100;
console.log(`複製の割合: ${copyRatio.toFixed(1)}%`);

if (copyRatio < 5) {
  console.warn("警告: 複製の割合が5%未満です。バウンディングボックスの判定が間違っている可能性があります。");
}

let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">\n`;
// 最背面にベースカラーを敷く（下が見えないようにする）
svgContent += `  <rect width="256" height="256" fill="${baseLayerFill}" />\n`;

for (const bucket of buckets) {
  if (bucket.paths.length > 0) {
    svgContent += `  <path fill="${bucket.fill}" opacity="${bucket.opacity}" d="${bucket.paths.join('')}"/>\n`;
  }
}
svgContent += `</svg>`;

const outPath = path.join(__dirname, 'ground.svg');
fs.writeFileSync(outPath, svgContent, 'utf-8');

console.log(`生成完了: ${outPath}`);
console.log(`ファイルサイズ: ${fs.statSync(outPath).size} bytes`);
