import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// P53: 優勝機体の整備（防衛耐久回復・優勝戦反映）の E2E。
// 前提: backend(8787) と frontend(5199) が起動しており、dev seed で user1(pass=user1) が
// 個人優勝者になっていること（seed_dev + seed_dev_teams）。ローカルD1へ wrangler で状態を仕込む。
// playwright は frontend/ から実行される
const backendDir = path.resolve(process.cwd(), '..', 'backend');

function d1Command(sql: string) {
  execSync(`npx wrangler d1 execute gtactics-db --local --command "${sql}"`, {
    cwd: backendDir, stdio: 'pipe',
  });
}
function d1File(sql: string) {
  const f = path.join(backendDir, '.e2e-champion-seed.sql');
  fs.writeFileSync(f, sql);
  try {
    execSync(`npx wrangler d1 execute gtactics-db --local --file="${f}"`, { cwd: backendDir, stdio: 'pipe' });
  } finally {
    fs.unlinkSync(f);
  }
}

test.use({ baseURL: 'http://localhost:5199' });

test.describe('優勝機体の整備（防衛耐久回復）', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    // user1 を「削れた個人優勝者」に仕込む（def_hp 300/1000）
    d1File(`UPDATE champions SET snapshot_data='{"maxHp":1000,"maxEn":200}', def_hp=300, def_en=50 WHERE type='individual' AND champion_id='user1';`);
  });

  test.afterAll(() => {
    // dev DB を元の状態（スナップショット無し）へ戻す
    d1Command(`UPDATE champions SET snapshot_data=NULL, def_hp=NULL, def_en=NULL WHERE champion_id='user1'`);
  });

  const login = async (page: Page) => {
    await page.goto('/');
    await page.getByPlaceholder('ログインID').fill('user1');
    await page.getByPlaceholder('パスワード').fill('user1');
    await page.getByRole('button', { name: 'LOGIN' }).click();
    await expect(page).toHaveURL(/mypage/i);
  };

  const champDefHp = (page: Page) =>
    page.evaluate(async () => {
      const token = localStorage.getItem('gtactics_token');
      const r = await fetch('/api/champion', { headers: { Authorization: `Bearer ${token}` } });
      type ChampionResponse = { individual?: { def_hp?: number } };
      const d = (await r.json()) as ChampionResponse;
      return d?.individual?.def_hp;
    });

  test('優勝者だけボタンが出て、押すと防衛耐久が満タンに戻る', async ({ page }) => {
    await login(page);

    // 仕込んだ削れHPが見えている
    expect(await champDefHp(page)).toBe(300);

    // 優勝者なのでボタンが表示される
    const repairBtn = page.getByRole('button', { name: /防衛データを整備/ });
    await expect(repairBtn).toBeVisible();

    await repairBtn.click();

    // 防衛耐久が満タン(1000)に戻る
    await expect.poll(() => champDefHp(page), { timeout: 5000 }).toBe(1000);
  });

  test('非優勝者にはボタンが出ない', async ({ page }) => {
    // user2 は優勝者ではない
    await page.goto('/');
    await page.getByPlaceholder('ログインID').fill('user2');
    await page.getByPlaceholder('パスワード').fill('user2');
    await page.getByRole('button', { name: 'LOGIN' }).click();
    await expect(page).toHaveURL(/mypage/i);

    await expect(page.getByRole('button', { name: /防衛データを整備/ })).toHaveCount(0);
  });
});
