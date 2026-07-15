// ============================================================
// 管理者アカウントの作成／昇格（ローカル・本番の両対応）
//
//   npm run admin -- --id=foo --local          既存キャラを管理者に昇格
//   npm run admin -- --id=foo --remote         （本番）
//   npm run admin -- --id=foo --handle=名前 --chara=キャラ名 --create --local
//                                              新規に管理者キャラを作成
//
// パスワードは引数で渡さない（シェル履歴に残るため）。実行時にプロンプトで入力するか、
// 環境変数 ADMIN_PASSWORD で渡す。
//
// 実装メモ:
// - パスワードは本体(auth.ts)と同じ SHA-256 hex・ソルト無しで作る。方式を変えるとログインできない。
// - SQL は一時ファイル(UTF-8)に書いて --file で流す。--command でコマンドラインに日本語を載せると
//   シェル(特に Windows の Git Bash)が文字コードを壊し、名前が化けたまま DB に入る。
// - 文字列は '' エスケープして埋め込む。
// ============================================================
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const DB_NAME = 'gtactics-db';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const id = args.id;
const isRemote = !!args.remote;
const isLocal = !!args.local;
const doCreate = !!args.create;

function die(msg) { console.error('✗ ' + msg); process.exit(1); }

if (!id) die('--id は必須です。例: npm run admin -- --id=myadmin --local');
if (isRemote === isLocal) die('--local か --remote のどちらか一方を指定してください（事故防止のため既定値なし）。');
if (!/^[A-Za-z0-9_-]+$/.test(id)) die('--id は英数字・_・- のみにしてください。');

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// wrangler は node_modules 内の JS 本体を直接叩く。
// Windows では .cmd を execFileSync から起動できない（spawnSync EINVAL）ため、npx/.bin は使わない。
const HERE = resolve(fileURLToPath(import.meta.url), '..');
const WRANGLER_JS = resolve(HERE, '../node_modules/wrangler/bin/wrangler.js');

function exec(sqlText) {
  if (!existsSync(WRANGLER_JS)) die('wrangler が見つかりません。backend で npm install を実行してください。');
  const dir = mkdtempSync(join(tmpdir(), 'gt-admin-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, sqlText, 'utf8'); // UTF-8 で書く＝日本語が壊れない
  try {
    return execFileSync(
      process.execPath, // node
      [WRANGLER_JS, 'd1', 'execute', DB_NAME, isRemote ? '--remote' : '--local', '--file', file, '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: resolve(HERE, '..') }
    );
  } finally {
    try { unlinkSync(file); } catch {}
  }
}

function query(sql) {
  const out = exec(sql);
  const m = out.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return JSON.parse(m[0])[0]?.results ?? []; } catch { return []; }
}

function promptHidden(q) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function (s) { if (rl.muted) rl.output.write('*'); else rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); res(a); });
    rl.muted = true;
  });
}

const target = isRemote ? '本番(remote)' : 'ローカル(local)';
console.log(`対象: ${target} / DB: ${DB_NAME} / id: ${id}`);

const existing = query(`SELECT id, handle_name, is_admin FROM characters WHERE id = ${sqlStr(id)};`);

if (existing.length > 0) {
  // ---- 既存キャラを昇格 ----
  const u = existing[0];
  if (u.is_admin === 1) {
    console.log(`✔ ${u.handle_name} (${id}) は既に管理者です。変更なし。`);
    process.exit(0);
  }
  exec(`UPDATE characters SET is_admin = 1 WHERE id = ${sqlStr(id)};`);
  const after = query(`SELECT handle_name, is_admin FROM characters WHERE id = ${sqlStr(id)};`);
  if (after[0]?.is_admin !== 1) die('昇格に失敗しました。');
  console.log(`✔ ${after[0].handle_name} (${id}) を管理者に昇格しました [${target}]`);
  process.exit(0);
}

// ---- 新規作成 ----
if (!doCreate) {
  die(`id=${id} のキャラが存在しません。\n` +
      `  既存キャラを昇格するなら、先にサイトで登録してから再実行してください。\n` +
      `  新規に作るなら --create --handle=<ハンドル名> --chara=<キャラ名> を付けてください。`);
}
const handle = args.handle;
const chara = args.chara;
if (!handle || !chara) die('--create には --handle と --chara が必要です。');

const password = process.env.ADMIN_PASSWORD || (await promptHidden('パスワード: '));
if (!password || password.length < 8) die('パスワードは8文字以上にしてください。');

// 列と既定値は auth.ts の register に合わせる（unit_id=0 は初期機体、money は初期資金）
const sql = `
INSERT INTO characters
  (id, password_hash, handle_name, email, chara_name,
   status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range,
   unit_id, money, traits, skills, is_admin)
VALUES
  (${sqlStr(id)}, ${sqlStr(sha256Hex(password))}, ${sqlStr(handle)}, '', ${sqlStr(chara)},
   10, 10, 10, 10, 10,
   0, 1000, '{}', '{}', 1);
`;
exec(sql);
const made = query(`SELECT id, handle_name, chara_name, is_admin FROM characters WHERE id = ${sqlStr(id)};`);
if (made[0]?.is_admin !== 1) die('作成に失敗しました。');
console.log(`✔ 管理者を作成しました [${target}]`);
console.log(`   id: ${made[0].id} / handle: ${made[0].handle_name} / chara: ${made[0].chara_name}`);
