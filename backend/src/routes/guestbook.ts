import { Hono } from 'hono';
import { verify } from 'hono/jwt';

export const guestbookApp = new Hono<{ Bindings: any }>();

async function getUserId(c: any): Promise<string | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    return payload?.id as string || null;
  } catch {
    return null;
  }
}

export function validateGuestbookContent(content: string): boolean {
  if (typeof content !== 'string') return false;
  const trimmed = content.trim();
  return trimmed.length >= 1 && trimmed.length <= 140;
}

export function isRateLimitedPure(lastPostTimestampMs: number | null, currentMs: number): boolean {
  if (lastPostTimestampMs === null) return false;
  return (currentMs - lastPostTimestampMs) < 60 * 60 * 1000;
}

guestbookApp.get('/:targetUserId', async (c) => {
  const targetUserId = c.req.param('targetUserId');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const db = c.env.DB;

  try {
    const { results: notes } = await db.prepare(`
      SELECT g.id, g.target_user_id, g.author_user_id, g.content, g.created_at, c.handle_name as author_handle_name
      FROM museum_guestbook g
      JOIN characters c ON g.author_user_id = c.id
      WHERE g.target_user_id = ? AND g.is_deleted = 0
      ORDER BY g.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(targetUserId, limit, offset).all();

    return c.json({ success: true, notes });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

guestbookApp.post('/:targetUserId', async (c) => {
  const authorUserId = await getUserId(c);
  if (!authorUserId) return c.json({ success: false, message: 'Unauthorized' }, 401);

  const targetUserId = c.req.param('targetUserId');
  const db = c.env.DB;

  try {
    const body = await c.req.json();
    const content = body.content || '';

    if (!validateGuestbookContent(content)) {
      return c.json({ success: false, message: 'コメントは1〜140文字で入力してください' }, 400);
    }

    const targetUser: any = await db.prepare('SELECT id FROM characters WHERE id = ?').bind(targetUserId).first();
    if (!targetUser) {
      return c.json({ success: false, message: '対象ユーザーが見つかりません' }, 404);
    }

    const targetFacility: any = await db.prepare('SELECT level FROM user_facilities WHERE user_id = ? AND facility = ?').bind(targetUserId, 'museum').first();
    if (!targetFacility || targetFacility.level < 1) {
      return c.json({ success: false, message: '博物館が建設されていません' }, 403);
    }

    const lastPost: any = await db.prepare(`
      SELECT created_at FROM museum_guestbook 
      WHERE author_user_id = ? AND target_user_id = ? 
      ORDER BY created_at DESC LIMIT 1
    `).bind(authorUserId, targetUserId).first();

    if (lastPost && lastPost.created_at) {
      const lastPostMs = new Date(lastPost.created_at + 'Z').getTime();
      if (isRateLimitedPure(lastPostMs, Date.now())) {
        return c.json({ success: false, message: '連続投稿は控えてください（1時間に1回まで）' }, 429);
      }
    }

    await db.prepare(`
      INSERT INTO museum_guestbook (target_user_id, author_user_id, content)
      VALUES (?, ?, ?)
    `).bind(targetUserId, authorUserId, content.trim()).run();

    return c.json({ success: true, message: 'ノートに記帳しました' });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

guestbookApp.delete('/:noteId', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

  const noteId = c.req.param('noteId');
  const db = c.env.DB;

  try {
    const note: any = await db.prepare('SELECT target_user_id, author_user_id FROM museum_guestbook WHERE id = ?').bind(noteId).first();
    if (!note) {
      return c.json({ success: false, message: 'ノートが見つかりません' }, 404);
    }

    if (note.target_user_id !== userId && note.author_user_id !== userId) {
      return c.json({ success: false, message: '削除権限がありません' }, 403);
    }

    await db.prepare('UPDATE museum_guestbook SET is_deleted = 1 WHERE id = ?').bind(noteId).run();

    return c.json({ success: true, message: 'ノートを削除しました' });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});
