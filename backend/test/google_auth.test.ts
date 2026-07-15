import { describe, it, expect, beforeAll } from 'vitest'
import { sign } from 'hono/jwt'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { signSignupToken, verifySignupToken, buildAuthUrl, callbackUrl } from '../src/utils/googleAuth'

const OK_STATS = {
  status_intuition: 20,
  status_piloting: 20,
  status_short_range: 20,
  status_mid_range: 20,
  status_long_range: 20,
}

async function roll(env: any) {
  const res = await app.request('/api/register/roll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }, env)
  return (await res.json()) as any
}

async function register(env: any, body: Record<string, unknown>) {
  const res = await app.request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, env)
  return { status: res.status, json: (await res.json()) as any }
}

describe('Google アカウント連携', () => {
  let env: any

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = {
      DB: db,
      JWT_SECRET: 'test-secret',
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      PUBLIC_ORIGIN: 'http://localhost:5199',
    }
  })

  describe('同意画面へのURL組み立て', () => {
    it('スコープは openid だけ（メールも氏名も要求しない）', async () => {
      const url = new URL(await buildAuthUrl(env, 'http://localhost:8787/api/auth/google/start', 'login'))
      // 個人情報を集めない方針。email / profile を足すと characters.email を廃止した意味が無くなる
      expect(url.searchParams.get('scope')).toBe('openid')
      expect(url.searchParams.get('scope')).not.toContain('email')
      expect(url.searchParams.get('scope')).not.toContain('profile')
    })

    it('認可コードフローで、クライアントIDとリダイレクトURIが載る', async () => {
      const url = new URL(await buildAuthUrl(env, 'http://localhost:8787/api/auth/google/start', 'login'))
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('client_id')).toBe(env.GOOGLE_CLIENT_ID)
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5199/api/auth/google/callback')
    })

    it('client_secret は同意画面のURLに載らない', async () => {
      const url = await buildAuthUrl(env, 'http://localhost:8787/api/auth/google/start', 'login')
      expect(url).not.toContain(env.GOOGLE_CLIENT_SECRET)
    })

    it('state は署名されており、改竄すると弾かれる', async () => {
      const url = new URL(await buildAuthUrl(env, 'http://localhost:8787/api/auth/google/start', 'link', 'user1'))
      const state = url.searchParams.get('state')!

      const res = await app.request(`/api/auth/google/callback?code=x&state=${encodeURIComponent(state + 'x')}`, {}, env)
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toContain('error=bad_state')
    })
  })

  describe('リダイレクトURIの決定', () => {
    it('PUBLIC_ORIGIN があればそれを使う（ローカルは Vite のプロキシで origin がズレるため）', () => {
      // Worker から見た自分は 8787 だが、ブラウザは 5199 にいる
      expect(callbackUrl({ PUBLIC_ORIGIN: 'http://localhost:5199' }, 'http://localhost:8787/api/x'))
        .toBe('http://localhost:5199/api/auth/google/callback')
    })

    it('PUBLIC_ORIGIN が無ければリクエストの origin から導出する（本番の想定）', () => {
      expect(callbackUrl({}, 'https://g-tactics.example.workers.dev/api/auth/google/start'))
        .toBe('https://g-tactics.example.workers.dev/api/auth/google/callback')
    })

    it('末尾のスラッシュがあっても二重にならない', () => {
      expect(callbackUrl({ PUBLIC_ORIGIN: 'https://example.com/' }, 'http://x/'))
        .toBe('https://example.com/api/auth/google/callback')
    })
  })

  describe('登録引き継ぎトークン', () => {
    it('署名して往復させると sub が取り出せる', async () => {
      const t = await signSignupToken('test-secret', 'google-sub-123')
      expect(await verifySignupToken('test-secret', t)).toBe('google-sub-123')
    })

    it('別の秘密鍵で署名されたトークンは拒否される', async () => {
      const t = await signSignupToken('attacker-secret', 'google-sub-123')
      expect(await verifySignupToken('test-secret', t)).toBeNull()
    })

    it('期限切れのトークンは拒否される', async () => {
      const expired = await sign({ google_sub: 'x', exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret')
      expect(await verifySignupToken('test-secret', expired)).toBeNull()
    })
  })

  describe('Google での新規登録', () => {
    it('パスワード無しで登録でき、google_sub が保存される', async () => {
      const rolled = await roll(env)
      const googleToken = await signSignupToken('test-secret', 'sub-newuser')

      const { status, json } = await register(env, {
        id: 'googleuser',
        handle_name: 'Gユーザー',
        chara_name: 'Gパイロット',
        ...OK_STATS,
        roll_token: rolled.token,
        google_token: googleToken,
      })
      if (status !== 200) console.error(json)
      expect(status).toBe(200)

      const row: any = await env.DB.prepare('SELECT google_sub, password_hash FROM characters WHERE id = ?').bind('googleuser').first()
      expect(row.google_sub).toBe('sub-newuser')
      // パスワードを持たない印。verifyPassword('') は必ず false を返すので
      // この行はパスワードでのログインが構造的に不可能になる
      expect(row.password_hash).toBe('')

      // Google 経路こそトークンが要る。無いとログイン画面へ送り返され、
      // たった今認証したばかりの Google をもう一往復させることになる。
      // しかもこの人はパスワードを持たないので、その画面のID/パスワード欄は一生使えない。
      expect(json.token).toBeTruthy()
      const me = await app.request('/api/me', { headers: { Authorization: `Bearer ${json.token}` } }, env)
      expect(me.status).toBe(200)
      expect(((await me.json()) as any).user.id).toBe('googleuser')
    })

    it('パスワードを持たないので、パスワードではログインできない', async () => {
      for (const pw of ['', ' ', 'password', 'googleuser']) {
        const res = await app.request('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'googleuser', password: pw }),
        }, env)
        expect(res.status).toBe(401)
      }
    })

    it('同じ Google アカウントで2キャラ目は作れない', async () => {
      const rolled = await roll(env)
      const googleToken = await signSignupToken('test-secret', 'sub-newuser') // 既に使用済み
      const { status, json } = await register(env, {
        id: 'googleuser2',
        handle_name: 'G2',
        chara_name: 'G2',
        ...OK_STATS,
        roll_token: rolled.token,
        google_token: googleToken,
      })
      expect(status).toBe(400)
      expect(json.message).toContain('既に別のキャラクター')
    })

    it('偽造した google_token では登録できない', async () => {
      const rolled = await roll(env)
      const { status } = await register(env, {
        id: 'faker',
        handle_name: 'F',
        chara_name: 'F',
        ...OK_STATS,
        roll_token: rolled.token,
        google_token: await signSignupToken('attacker-secret', 'sub-anything'),
      })
      expect(status).toBe(400)
    })

    it('パスワードも google_token も無ければ登録できない', async () => {
      const rolled = await roll(env)
      const { status } = await register(env, {
        id: 'neither',
        handle_name: 'N',
        chara_name: 'N',
        ...OK_STATS,
        roll_token: rolled.token,
      })
      expect(status).toBe(400)
    })
  })

  describe('連携の開始（link-start）', () => {
    it('未認証では 401', async () => {
      const res = await app.request('/api/auth/google/link-start', { method: 'POST' }, env)
      expect(res.status).toBe(401)
    })

    it('認証済みなら、紐づけ先を署名済み state に埋めたURLを返す', async () => {
      const token = await sign({ id: 'googleuser', exp: Math.floor(Date.now() / 1000) + 600 }, 'test-secret')
      const res = await app.request('/api/auth/google/link-start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }, env)
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.success).toBe(true)

      const url = new URL(json.url)
      const state = url.searchParams.get('state')!
      expect(state).toBeTruthy()

      // state は JWT なので中身は読める（base64 は暗号化ではない）。
      // ここで守りたいのは秘匿ではなく改竄不可であること ── キャラIDは
      // /profile/:id で既に公開されているので、読めること自体は問題にならない。
      // 重要なのは「他人のIDに書き換えて他人のキャラに連携する」ができないこと。
      const claims = JSON.parse(atob(state.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      expect(claims.link_to).toBe('googleuser')
      expect(claims.mode).toBe('link')

      // 署名を壊した state は通らない（＝書き換えは不可能）
      const tampered = state.slice(0, -3) + 'AAA'
      const bad = await app.request(`/api/auth/google/callback?code=x&state=${encodeURIComponent(tampered)}`, {}, env)
      expect(bad.headers.get('location')).toContain('error=bad_state')
    })
  })

  describe('連携の解除（unlink）', () => {
    const authFor = (id: string) => sign({ id, exp: Math.floor(Date.now() / 1000) + 600 }, 'test-secret')

    it('未認証では 401', async () => {
      const res = await app.request('/api/auth/google/unlink', { method: 'POST' }, env)
      expect(res.status).toBe(401)
    })

    // ここが破れると、本人が自分のアカウントに二度と入れなくなる
    it('パスワードを持たない人は解除できない（ログイン手段がゼロになるため）', async () => {
      const res = await app.request('/api/auth/google/unlink', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await authFor('googleuser')}` },
      }, env)
      expect(res.status).toBe(400)
      expect(((await res.json()) as any).message).toContain('パスワードを設定')

      // 連携は残ったまま（＝ログインできる状態が保たれている）
      const row: any = await env.DB.prepare('SELECT google_sub FROM characters WHERE id = ?').bind('googleuser').first()
      expect(row.google_sub).toBe('sub-newuser')
    })

    it('パスワードを設定すれば解除できる', async () => {
      // パスワード未設定なので current_password 無しで初回設定できる
      const setPw = await app.request('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authFor('googleuser')}` },
        body: JSON.stringify({ new_password: 'newly-set-password' }),
      }, env)
      expect(setPw.status).toBe(200)

      const res = await app.request('/api/auth/google/unlink', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await authFor('googleuser')}` },
      }, env)
      expect(res.status).toBe(200)

      const row: any = await env.DB.prepare('SELECT google_sub FROM characters WHERE id = ?').bind('googleuser').first()
      expect(row.google_sub).toBeNull()

      // 解除後は設定したパスワードでログインできる（＝締め出されていない）
      const login = await app.request('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'googleuser', password: 'newly-set-password' }),
      }, env)
      expect(login.status).toBe(200)
    })

    it('連携していない状態で解除しようとしたら 400', async () => {
      const res = await app.request('/api/auth/google/unlink', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await authFor('googleuser')}` },
      }, env)
      expect(res.status).toBe(400)
      expect(((await res.json()) as any).message).toContain('連携されていません')
    })

    it('解除した Google アカウントは、別のキャラに連携し直せる', async () => {
      // 一意索引が解除後の再利用を妨げないこと
      const rolled = await roll(env)
      const { status } = await register(env, {
        id: 'reuser',
        handle_name: 'R',
        chara_name: 'R',
        ...OK_STATS,
        roll_token: rolled.token,
        google_token: await signSignupToken('test-secret', 'sub-newuser'),
      })
      expect(status).toBe(200)
    })
  })

  describe('パスワードの初回設定（Google のみで登録した人の詰み防止）', () => {
    it('パスワードを持つ人は、現在のパスワード無しでは変更できない', async () => {
      const rolled = await roll(env)
      await register(env, {
        id: 'pwuser', password: 'original-pw', handle_name: 'P', chara_name: 'P',
        ...OK_STATS, roll_token: rolled.token,
      })
      const token = await sign({ id: 'pwuser', exp: Math.floor(Date.now() / 1000) + 600 }, 'test-secret')

      const res = await app.request('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_password: 'hijacked' }),
      }, env)
      expect(res.status).toBe(400)

      // 元のパスワードのままであること
      const login = await app.request('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'pwuser', password: 'original-pw' }),
      }, env)
      expect(login.status).toBe(200)
    })
  })

  describe('コールバック', () => {
    it('同意画面でキャンセルされたらエラーとして戻す', async () => {
      const res = await app.request('/api/auth/google/callback?error=access_denied', {}, env)
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toContain('/auth/google#error=cancelled')
    })

    it('code が無ければエラーとして戻す', async () => {
      const res = await app.request('/api/auth/google/callback?state=x', {}, env)
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toContain('error=cancelled')
    })

    it('戻り先は PUBLIC_ORIGIN（ブラウザのいる場所）になる', async () => {
      const res = await app.request('/api/auth/google/callback?error=access_denied', {}, env)
      expect(res.headers.get('location')!.startsWith('http://localhost:5199/auth/google#')).toBe(true)
    })
  })
})
