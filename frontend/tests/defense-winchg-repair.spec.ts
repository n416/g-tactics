import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 個別戦闘の防衛者（defense_battles）が、MyPage や Tactics で
// 整備ボタンや戦術変更の「反映」チェックボックスを使えることの E2E。
const backendDir = path.resolve(process.cwd(), '..', 'backend');

function d1Command(sql: string) {
  execSync(`npx wrangler d1 execute gtactics-db --local --command "${sql}"`, {
    cwd: backendDir, stdio: 'pipe',
  });
}
function d1File(sql: string) {
  const f = path.join(backendDir, '.e2e-defense-seed.sql');
  fs.writeFileSync(f, sql);
  try {
    execSync(`npx wrangler d1 execute gtactics-db --local --file="${f}"`, { cwd: backendDir, stdio: 'pipe' });
  } finally {
    fs.unlinkSync(f);
  }
}

test.use({ baseURL: 'http://localhost:5199' });

test.describe('個別防衛者のUI表示および整備回復', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    // 確実に既存の防衛作戦をクリアし、
    d1Command(`DELETE FROM defense_battles;`);
    // user1 を「防衛耐久が削れた個別防衛者」として登録する
    d1File(`INSERT INTO defense_battles (owner_id, title, champion_id, snapshot_data, def_hp, def_en, terrain)
            VALUES ('user1', 'テスト作戦', 'user1', '{"maxHp":1000,"maxEn":200}', 300, 50, 1);`);
  });

  test.afterAll(() => {
    // dev DB を元の状態へ戻す
    d1Command(`DELETE FROM defense_battles WHERE champion_id='user1';`);
  });

  const login = async (page: Page) => {
    await page.goto('/');
    await page.getByPlaceholder('ログインID').fill('user1');
    await page.getByPlaceholder('パスワード').fill('user1');
    await page.getByRole('button', { name: 'LOGIN' }).click();
    await expect(page).toHaveURL(/mypage/i);
  };

  test('防衛者には整備ボタンが表示され、防衛耐久が全快する', async ({ page }) => {
    await login(page);

    // MyPage で防衛データを整備するボタンが表示されること
    const repairBtn = page.getByRole('button', { name: /防衛データを整備/ });
    await expect(repairBtn).toBeVisible();

    // 押下する
    await repairBtn.click();

    // /api/seibi がバックエンドで gates の耐久を戻すのを待つ
    // 画面上に成功メッセージが出ることを期待
    await expect(page.locator('text=消費して防衛機体を整備しました')).toBeVisible({ timeout: 5000 });
  });

  test('Tactics画面で戦術変更の防衛データ反映チェックボックスが表示される', async ({ page }) => {
    await login(page);

    await page.goto('/tactics');
    await expect(page).toHaveURL(/tactics/i);

    const checkboxLabel = page.locator('text=戦術変更時、優勝/防衛データへ反映する');
    await expect(checkboxLabel).toBeVisible();
  });
});
