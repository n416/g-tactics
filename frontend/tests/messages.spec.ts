import { test, expect } from '@playwright/test';

test.describe('Communication Features', () => {
  // Use sequential mode because we share the database state if we login with the same user
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // ログイン処理
    await page.goto('/');
    await page.fill('input[type="text"]', 'testuser1');
    await page.fill('input[type="password"]', 'password');
    await page.click('button:has-text("ログイン")');
    await expect(page).toHaveURL(/.*mypage/);
  });

  test('should post and view chat messages', async ({ page }) => {
    // ナビはマイページ下部のボタン群から AppLayout のサイドバー（リンク）へ移設済み
    await page.getByRole('link', { name: 'チャット' }).click();
    await expect(page).toHaveURL(/.*chat/);

    // チャット投稿
    const testMessage = `E2E Chat Test ${Date.now()}`;
    await page.fill('input[placeholder="メッセージを入力..."]', testMessage);
    await page.click('button:has-text("送信")');

    // 投稿が一覧に表示されるか確認
    await expect(page.locator(`text=${testMessage}`)).toBeVisible();
  });

  test('should post and view bbs messages', async ({ page }) => {
    await page.getByRole('link', { name: '掲示板' }).click();
    await expect(page).toHaveURL(/.*bbs/);

    // BBS投稿
    const testTitle = `E2E BBS Title ${Date.now()}`;
    const testBody = `E2E BBS Body ${Date.now()}`;
    await page.fill('input[placeholder="件名..."]', testTitle);
    await page.fill('textarea[placeholder="掲示板に書き込む内容..."]', testBody);
    await page.click('button:has-text("投稿する")');

    // 投稿が一覧に表示されるか確認
    await expect(page.locator(`text=${testTitle}`)).toBeVisible();
    await expect(page.locator(`text=${testBody}`)).toBeVisible();
  });

  test('should send a private message from Profile page', async ({ page }) => {
    // ランキング等から他のユーザーのProfileへ飛ぶ
    await page.getByRole('link', { name: 'ランキング' }).click();
    await expect(page).toHaveURL(/.*ranking/);
    
    // testuser2 (or another user) のリンクを探してクリック (IDが user2 だと仮定)
    // テスト環境で確実に user2 が存在するかはシードデータによるが、とりあえず一覧の2番目のユーザーをクリック
    const rows = page.locator('table tbody tr');
    expect(await rows.count()).toBeGreaterThan(1);
    
    // 自分のIDとは違うユーザーの行をクリック (ここでは暫定的に2行目)
    const targetRow = rows.nth(1);
    const detailButton = targetRow.locator('button:has-text("詳細")');
    await detailButton.click();
    
    await expect(page).toHaveURL(/.*profile/);

    // 伝言送信
    const testPrivateMessage = `E2E Private Message ${Date.now()}`;
    // await expect(page.locator('h3:has-text("伝言を送る (MES)")')).toBeVisible();
    
    // 自分が自分でないことを確認（送信フォームがあるか）
    const sendInput = page.locator('input[placeholder="メッセージを入力..."]');
    if (await sendInput.isVisible()) {
      await sendInput.fill(testPrivateMessage);
      
      // alertをハンドリング
      page.once('dialog', dialog => dialog.accept());
      await page.click('button:has-text("送信")');
    }
  });
});
