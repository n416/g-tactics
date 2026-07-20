// ============================================================
// デプロイ前の点検（npm run preflight）
//
// 本番で「無言で壊れる」種類のものだけを、実際に本番へ問い合わせて確かめる。
//   - secret の入れ忘れ      → ログインだけが動かない
//   - マイグレーション忘れ    → baseline と実DBが drift する（過去に tournaments で発生）
//   - フロントのビルド忘れ    → 古い画面が配信される
//
// 読み取りしかしない。落ちても何も壊さない。
// ============================================================
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const BACKEND = resolve(HERE, '..');
const WRANGLER_JS = resolve(BACKEND, 'node_modules/wrangler/bin/wrangler.js');
const DIST = resolve(BACKEND, '../frontend/dist');

let ng = 0;
const ok = (m) => console.log(`  \x1b[32mOK\x1b[0m   ${m}`);
const bad = (m, how) => { ng++; console.log(`  \x1b[31mNG\x1b[0m   ${m}\n       → ${how}`); };
const warn = (m) => console.log(`  \x1b[33m--\x1b[0m   ${m}`);

function wrangler(args) {
  return execFileSync(process.execPath, [WRANGLER_JS, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: BACKEND,
  });
}

/** wrangler は JSON の前に進捗行や警告を出すので、最初の [ か { から拾う */
function parseJson(out) {
  const i = out.search(/[[{]/);
  if (i === -1) throw new Error('JSON が見つかりません');
  return JSON.parse(out.slice(i));
}

console.log('\n本番の状態を確認します（読み取りのみ）\n');

// 1) secret
console.log('シークレット');
try {
  const names = parseJson(wrangler(['secret', 'list'])).map((s) => s.name);
  for (const need of ['JWT_SECRET', 'GOOGLE_CLIENT_SECRET']) {
    if (names.includes(need)) ok(need);
    else bad(`${need} が未設定`, `npx wrangler secret put ${need}`);
  }
} catch (e) {
  warn(`確認できませんでした（${e.message.split('\n')[0]}）`);
}

// 2) スキーマ。baseline を変えたのに本番へ流し忘れる事故を捕まえる
console.log('\n本番DBのスキーマ');
const checks = [
  { sql: `SELECT COUNT(*) AS n FROM pragma_table_info('characters') WHERE name='email';`, want: 0,
    okMsg: 'email カラムは廃止済み', ngMsg: 'email カラムが残っている',
    how: 'npx wrangler d1 execute gtactics-db --remote --file ./tools/p56_drop_email.sql' },
  { sql: `SELECT COUNT(*) AS n FROM pragma_table_info('characters') WHERE name='google_sub';`, want: 1,
    okMsg: 'google_sub カラムがある', ngMsg: 'google_sub カラムが無い（Google 連携が落ちる）',
    how: 'npx wrangler d1 execute gtactics-db --remote --file ./tools/p57_add_google_sub.sql' },
  // P58（基地・博物館機能群）は1本の統合スクリプト。検知はテーブル/列ごとに分けて原因を特定しやすくする
  { sql: `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('user_unit_stats', 'user_bases', 'user_facilities', 'museum_settings', 'museum_exhibits', 'museum_guestbook');`, want: 6,
    okMsg: '基地・博物館機能群のテーブル6種がある', ngMsg: '基地・博物館機能群のテーブルが不足（基地/博物館/図鑑/ノートが落ちる）',
    how: 'npx wrangler d1 execute gtactics-db --remote --file ./tools/p58_base_museum.sql' },
  { sql: `SELECT COUNT(*) AS n FROM pragma_table_info('user_bases') WHERE name='shield_until';`, want: 1,
    okMsg: 'user_bases.shield_until カラムがある', ngMsg: '基地シールド用カラムが無い（旧p59適用DBのみ。手動ALTERが必要。p58_base_museum.sql のヘッダー参照）',
    how: `npx wrangler d1 execute gtactics-db --remote --command "ALTER TABLE user_bases ADD COLUMN shield_until INTEGER NOT NULL DEFAULT 0;"` },
];
for (const c of checks) {
  try {
    const n = parseJson(wrangler(['d1', 'execute', 'gtactics-db', '--remote', '--json', '--command', c.sql]))[0].results[0].n;
    if (n === c.want) ok(c.okMsg);
    else bad(c.ngMsg, c.how);
  } catch (e) {
    warn(`確認できませんでした（${e.message.split('\n')[0]}）`);
  }
}

// 3) フロントの成果物。npm run deploy が毎回ビルドするので通常は問題にならないが、
//    deploy:worker-only を使った場合にここで気付ける
console.log('\nフロントのビルド成果物');
if (!existsSync(resolve(DIST, 'index.html'))) {
  bad('frontend/dist が無い', 'cd ../frontend && npm run build');
} else {
  const newestSrc = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((max, e) => {
    const p = resolve(dir, e.name);
    return Math.max(max, e.isDirectory() ? newestSrc(p) : statSync(p).mtimeMs);
  }, 0);
  const src = newestSrc(resolve(BACKEND, '../frontend/src'));
  const built = statSync(resolve(DIST, 'index.html')).mtimeMs;
  if (src > built) bad('dist が src より古い（古い画面が配信される）', 'npm run deploy を使えば自動でビルドされます');
  else ok('dist は src より新しい');
}

console.log(ng === 0 ? '\n\x1b[32m問題ありません。\x1b[0m\n' : `\n\x1b[31m${ng} 件あります。上の → を実行してください。\x1b[0m\n`);
process.exit(ng === 0 ? 0 : 1);
