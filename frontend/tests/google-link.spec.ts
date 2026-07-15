import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ============================================================
 * アカウント設定（/account）のログイン方法まわり。
 *
 * 守りたい原則は1つ:「最後のログイン手段は外せない」。
 * これが破れると、Google だけで登録した人が連携を解除した瞬間に
 * ログイン手段がゼロになり、自分のアカウントへ二度と入れなくなる。
 *
 * サーバー側の拒否は backend/test/google_auth.test.ts が見ている。
 * ここで見るのは「その状況がユーザーに伝わるか」。
 * 以前は解除ボタンを disabled にして小さな注記を添えるだけで、
 * なぜ押せないのかが伝わらなかった（そもそも Google だけで登録した人は、
 * 自分がパスワードを持っていないことを自覚していない）。
 *
 * 【baseURL について】
 * playwright.config.ts の baseURL は 5173（Vite の既定値）だが、
 * .claude/launch.json の dev server は 5199。現状どの spec も走らないため、
 * この spec は絶対URLで自己完結させてある。設定が直ったら BASE を消してよい。
 *
 * 【前提】backend(8787) と frontend(5199) の dev server が起動していること。
 * ============================================================ */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5199';

// frontend/package.json が type:module なので __dirname は無い
const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(HERE, '../../backend');
const WRANGLER_JS = resolve(BACKEND, 'node_modules/wrangler/bin/wrangler.js');

/** ローカルの D1 に直接SQLを流す。テストが自分でお膳立てするための道具。
 * Windows では .cmd を execFileSync から起動できないため、npx ではなく node で wrangler を叩く
 * （backend/scripts/make_admin.mjs と同じ作法）。 */
function d1(sql: string) {
  if (!existsSync(WRANGLER_JS)) throw new Error('wrangler が見つかりません。backend で npm install してください。');
  execFileSync(
    process.execPath,
    [WRANGLER_JS, 'd1', 'execute', 'gtactics-db', '--local', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: BACKEND }
  );
}

const USER_ID = 'e2e_glink';
const PASSWORD = 'e2e-temp-pass';
const GOOGLE_SUB = 'e2e-sub-glink';

/** 旧方式（無ソルトSHA-256）。login はこれも受け付け、成功時に PBKDF2 へ移行する。
 * Google 専用ユーザーはパスワードを持たずログインAPIを通れない。そのため
 * 「一旦パスワード付きで作ってログイン → パスワードを消す」という手順でしか
 * その状態のセッションを作れない（JWT は発行済みなので有効なまま）。 */
const legacyHash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const cleanup = () => {
  d1(`DELETE FROM hangars WHERE user_id = '${USER_ID}';`);
  d1(`DELETE FROM characters WHERE id = '${USER_ID}';`);
};

/** パスワードと Google 連携の両方を持つキャラを作る */
function seedLinkedUser() {
  cleanup();
  d1(
    `INSERT INTO characters (id, password_hash, google_sub, handle_name, chara_name,
       status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range,
       unit_id, money, traits, skills)
     VALUES ('${USER_ID}', '${legacyHash(PASSWORD)}', '${GOOGLE_SUB}', 'E2E連携テスト', 'E2Eパイロット',
       20, 20, 20, 20, 20, 2, 1000, '{}', '{}');`
  );
  d1(`INSERT OR IGNORE INTO hangars (user_id, unit_id) VALUES ('${USER_ID}', 2);`);
}

/** ログイン方法の各行。0=パスワード / 1=Google */
const method = (page: Page, i: 0 | 1) => page.locator('.login-methods li').nth(i);

async function login(page: Page) {
  await page.goto(`${BASE}/`);
  await page.fill('input[type="text"]', USER_ID);
  await page.fill('input[type="password"]', PASSWORD);
  await page.getByRole('button', { name: 'LOGIN' }).click();
  await expect(page).toHaveURL(/.*mypage/);
}

/** ログイン済みのまま Google 専用（パスワード無し）の状態にする */
const makeGoogleOnly = () => d1(`UPDATE characters SET password_hash = '' WHERE id = '${USER_ID}';`);

test.describe('アカウント設定 / ログイン方法', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => seedLinkedUser());
  test.afterAll(() => cleanup());

  test('右上のユーザーメニューからアカウント設定へ行ける', async ({ page }) => {
    await login(page);
    // アカウント系の導線は画面右上に集約してある
    await page.locator('.user-menu-trigger').click();
    await page.getByRole('menuitem', { name: 'アカウント設定' }).click();
    await expect(page).toHaveURL(/.*account/);
    await expect(page.locator('.login-methods li')).toHaveCount(2);
  });

  test('ログイン方法が一覧で見え、状態が読める', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/account`);

    await expect(method(page, 0)).toContainText('パスワード');
    await expect(method(page, 0).locator('.lm-state')).toHaveText('設定済み');
    await expect(method(page, 1)).toContainText('Google');
    await expect(method(page, 1).locator('.lm-state')).toHaveText('連携済み');

    // 2つあるので「唯一の手段」警告は出ない
    await expect(page.locator('.account-alert')).toHaveCount(0);
    await expect(page.locator('.lm-warn')).toHaveCount(0);
  });

  test('パスワードを持つ人は、連携を解除できる', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/account`);

    await method(page, 1).getByRole('button', { name: '解除する' }).click();
    await expect(page.locator('.modal-title')).toHaveText('連携を解除する');
    await page.locator('.modal-foot').getByRole('button', { name: '解除する' }).click();

    await expect(method(page, 1).locator('.lm-state')).toHaveText('未連携');
    await expect(method(page, 1).getByRole('button', { name: '連携する' })).toBeVisible();
    // 手段が1つになったので警告が出る
    await expect(page.locator('.account-alert')).toContainText('ログイン方法が1つしかありません');
  });

  // ここが本丸。ユーザーは自分がパスワードを持っていないことを知らないので、
  // 「押せない」ではなく「なぜ押せないか」を見せる必要がある。
  test('Google だけの人には、解除できない理由が読める形で出る', async ({ page }) => {
    await login(page);
    makeGoogleOnly();
    await page.goto(`${BASE}/account`);

    // 状態が一覧で見える: パスワードは未設定、Google が唯一の手段
    await expect(method(page, 0).locator('.lm-state')).toHaveText('未設定');
    await expect(method(page, 1).locator('.lm-state')).toHaveText('連携済み');
    await expect(method(page, 1).locator('.lm-warn')).toHaveText('これが唯一のログイン方法です');
    await expect(page.locator('.account-alert')).toContainText('ログインする手段が無くなります');

    // 押した場合も、黙って失敗せず理由を出して次の一手を提案する
    await method(page, 1).getByRole('button', { name: '解除する' }).click();
    await expect(page.locator('.modal-title')).toHaveText('パスワードが未設定です');
    await expect(page.locator('.modal-body')).toContainText('ログインする手段が無くなります');
    await page.locator('.modal-foot').getByRole('button', { name: 'パスワードを設定する' }).click();

    // そのままパスワード設定モーダルへ繋がる
    await expect(page.locator('.modal-title')).toHaveText('パスワードを設定する');
    // 存在しない「現在のパスワード」を訊かない（訊くと永久に設定できず詰む）
    await expect(page.locator('.modal-body input[autocomplete="current-password"]')).toHaveCount(0);
  });

  test('パスワードを設定すれば解除でき、そのパスワードでログインできる', async ({ page }) => {
    await login(page);
    makeGoogleOnly();
    await page.goto(`${BASE}/account`);

    await method(page, 0).getByRole('button', { name: '設定する' }).click();
    await page.locator('.modal-body input[autocomplete="new-password"]').fill('brand-new-password');
    await page.locator('.modal-foot').getByRole('button', { name: '設定する' }).click();

    await expect(method(page, 0).locator('.lm-state')).toHaveText('設定済み');
    await expect(page.locator('.account-alert')).toHaveCount(0);

    // 手段が2つになったので解除できる
    await method(page, 1).getByRole('button', { name: '解除する' }).click();
    await expect(page.locator('.modal-title')).toHaveText('連携を解除する');
    await page.locator('.modal-foot').getByRole('button', { name: '解除する' }).click();
    await expect(method(page, 1).locator('.lm-state')).toHaveText('未連携');

    // 締め出されていないこと
    await page.evaluate(() => localStorage.removeItem('gtactics_token'));
    await page.goto(`${BASE}/`);
    await page.fill('input[type="text"]', USER_ID);
    await page.fill('input[type="password"]', 'brand-new-password');
    await page.getByRole('button', { name: 'LOGIN' }).click();
    await expect(page).toHaveURL(/.*mypage/);
  });

  test('未連携なら、マイページで連携を勧められる', async ({ page }) => {
    d1(`UPDATE characters SET google_sub = NULL WHERE id = '${USER_ID}';`);
    await login(page);

    // パスワード再設定の手段が無い以上、ここが唯一の復旧導線になる
    const banner = page.locator('.link-google-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('復旧できません');
  });
});
