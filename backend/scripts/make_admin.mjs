// ============================================================
// 管理者アカウントの作成／昇格（ローカル・本番の両対応）
//
//   npm run admin -- --id=foo --local          既存キャラを管理者に昇格【推奨】
//   npm run admin -- --id=foo --remote         （本番）
//   npm run admin -- --id=foo --handle=名前 --chara=キャラ名 --create --local
//                                              新規に管理者キャラを作成【非常用】
//
// ★ 昇格(サイトで登録 → このコマンドで昇格)を推奨する。--create は本体の登録処理を通らないため、
//   auth.ts の register が行う以下が再現されない:
//     - ランダムな特性を Lv1〜9 で1つ付与する（--create のキャラは特性を持たない＝戦闘計算に影響）
//     - ステータス合計値の上限チェック
//   --create は「サイトに登録導線が無い」等の非常用と考えること。
//
// パスワードは引数で渡さない（シェル履歴に残るため）。実行時にプロンプトで入力するか、
// 環境変数 ADMIN_PASSWORD で渡す。
//
// 実装メモ:
// - パスワードは本体(src/utils/password.ts)と同じ PBKDF2 で作る。方式を変えるとログインできない。
// - 読み取り(SELECT)は --command を使う。--remote の --file は実行結果の行ではなく
//   「実行統計」(Total queries executed 等)を返すため、行が取れず存在判定を誤る。
// - 書き込みは一時ファイル(UTF-8)に書いて --file で流す。日本語を含むため。
// - 文字列は '' エスケープして埋め込む。
// ============================================================
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync, existsSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
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

// パスワードのハッシュ。src/utils/password.ts と同一の方式・同一の保存形式にすること。
// ここが本体とズレると、作った管理者がログインできない。
//   形式: pbkdf2$<iterations>$<salt_b64>$<hash_b64>
// 本体は WebCrypto、こちらは node:crypto を使うが、
// PBKDF2-HMAC-SHA256 / UTF-8 の平文 / 生バイトのソルト という条件が同じなので出力は一致する。
// （この一致は test/password.test.ts が検証している）
// src/utils/password.ts の ITERATIONS と必ず同じ値にすること。
// node:crypto はいくらでも大きい回数を受け付けるが、Cloudflare Workers は
// 100,000 までしか受け付けない（超えると本番でだけ検証が例外になり、
// ここで作った管理者が二度とログインできなくなる）。
const PBKDF2_ITERATIONS = 100_000;
const hashPassword = (password) => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
};

// wrangler は node_modules 内の JS 本体を直接叩く。
// Windows では .cmd を execFileSync から起動できない（spawnSync EINVAL）ため、npx/.bin は使わない。
const HERE = resolve(fileURLToPath(import.meta.url), '..');
const WRANGLER_JS = resolve(HERE, '../node_modules/wrangler/bin/wrangler.js');

function runWrangler(extraArgs) {
  if (!existsSync(WRANGLER_JS)) die('wrangler が見つかりません。backend で npm install を実行してください。');
  return execFileSync(
    process.execPath, // node（Windows では .cmd を execFileSync から起動できないため npx は使わない）
    [WRANGLER_JS, 'd1', 'execute', DB_NAME, isRemote ? '--remote' : '--local', ...extraArgs, '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: resolve(HERE, '..') }
  );
}

// 書き込み用。SQL を一時ファイル(UTF-8)経由で流す＝日本語が壊れない。
// ※--file は --remote だと「実行統計」を返し、SELECT の行は返らないので読み取りには使えない。
function exec(sqlText) {
  const dir = mkdtempSync(join(tmpdir(), 'gt-admin-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, sqlText, 'utf8');
  try {
    return runWrangler(['--file', file]);
  } finally {
    try { unlinkSync(file); } catch {}
  }
}

// 読み取り用。--command を使う（--remote の --file は実行統計しか返さないため）。
// SQL は execFileSync の引数配列で渡す＝シェルを介さないので壊れない。
// 呼び出し側の SELECT は id しか埋め込まない（id は英数字に検証済み）ため日本語は乗らない。
function query(sql) {
  const out = runWrangler(['--command', sql]);
  // wrangler は JSON の前に進捗行や警告(例: "▲ [WARNING] ...")を出すため、
  // 単純な [ ... ] のマッチでは壊れる。JSON 配列が始まる行から後ろだけを取る。
  const start = out.search(/^\[/m);
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(out.slice(start));
    return parsed[0]?.results ?? [];
  } catch {
    return [];
  }
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

console.warn(
  '⚠ --create は本体の登録処理(auth.ts register)を通りません。\n' +
  '  作成されるキャラは「特性なし」になります（通常の登録ではランダムな特性が Lv1〜9 で1つ付きます）。\n' +
  '  可能なら、サイトで新規登録してから --create 無しで昇格してください。'
);

const password = process.env.ADMIN_PASSWORD || (await promptHidden('パスワード: '));
if (!password || password.length < 8) die('パスワードは8文字以上にしてください。');

// 列と既定値は auth.ts の register に合わせる（money=1000・unit_id=0・skills={}）。
// traits だけは register がランダム付与するため再現しない（上の警告を参照）。
const sql = `
INSERT INTO characters
  (id, password_hash, handle_name, chara_name,
   status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range,
   unit_id, money, traits, skills, is_admin)
VALUES
  (${sqlStr(id)}, ${sqlStr(hashPassword(password))}, ${sqlStr(handle)}, ${sqlStr(chara)},
   10, 10, 10, 10, 10,
   0, 1000, '{}', '{}', 1);
`;
exec(sql);
const made = query(`SELECT id, handle_name, chara_name, is_admin FROM characters WHERE id = ${sqlStr(id)};`);
if (made[0]?.is_admin !== 1) die('作成に失敗しました。');
console.log(`✔ 管理者を作成しました [${target}]`);
console.log(`   id: ${made[0].id} / handle: ${made[0].handle_name} / chara: ${made[0].chara_name}`);
