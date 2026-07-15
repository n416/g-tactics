import { sign, verify } from 'hono/jwt'

/* ============================================================
 * Google アカウント連携（OAuth 2.0 認可コードフロー）
 *
 * 【なぜコードフローか】
 * ブラウザ側で Google の JS（One Tap 等）を動かす方式もあるが、そちらは
 * ID トークンをブラウザで受け取るため、サーバー側で署名検証（JWKS 取得＋RS256）が要る。
 * コードフローなら、ID トークンを Google のトークンエンドポイントから TLS 越しに
 * 直接受け取るので、署名検証を自前でやらずに済む（Google の公式ガイダンス）。
 * 第三者の JS をアプリに読み込ませずに済むのも利点。
 *
 * 【スコープは openid だけ】
 * 受け取るのは sub（このアプリ専用の不変な識別子）のみ。
 * email も profile も要求しない＝メールアドレスも氏名も受け取らないし保存しない。
 * characters.email を「使わない個人情報を持たない」という理由で廃止した以上、
 * Google から貰い始めたら本末転倒になる。
 * ============================================================ */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CALLBACK_PATH = '/api/auth/google/callback'

/** state / 登録引き継ぎトークンの有効期限（秒）。往復するだけなので短くてよい */
const STATE_TTL = 10 * 60

export type GoogleMode = 'login' | 'link'

/** state に載せる中身。CSRF 対策として署名し、往復させて検証する。
 *
 * 署名はするが暗号化はしない（JWT のペイロードは base64 なので誰でも読める）。
 * ここで要るのは秘匿ではなく改竄不可であること ── link_to のキャラIDは
 * /profile/:id で既に公開されているので読めても困らない。防ぎたいのは
 * 「他人のIDに書き換えて、他人のキャラに自分の Google を連携する」ことであり、
 * それは署名検証で塞がる。秘密を載せる用途には使わないこと。 */
type StatePayload = {
  mode: GoogleMode
  /** mode='link' のとき、どのキャラに紐づけるか */
  link_to?: string
  nonce: string
  exp: number
}

/** 新規登録へ引き継ぐトークン。sub を平文でURLに載せないための封筒 */
type SignupPayload = {
  google_sub: string
  exp: number
}

/**
 * リダイレクト先の絶対URL。Google に登録した「承認済みのリダイレクト URI」と
 * 1文字でも違うと redirect_uri_mismatch になる。
 *
 * ローカルでは Vite(5199) が /api を wrangler(8787) へプロキシしているため、
 * Worker から見た自分の origin は 8787 だが、ブラウザがいるのは 5199 である。
 * この食い違いを埋めるために PUBLIC_ORIGIN で明示的に上書きする。
 * 本番はプロキシが挟まらないので、未設定ならリクエストの origin から導出してよい。
 */
export function callbackUrl(env: { PUBLIC_ORIGIN?: string }, requestUrl: string): string {
  const origin = env.PUBLIC_ORIGIN || new URL(requestUrl).origin
  return `${origin.replace(/\/$/, '')}${CALLBACK_PATH}`
}

/** Google の同意画面へ送るURLを組み立てる */
export async function buildAuthUrl(
  env: { GOOGLE_CLIENT_ID: string; JWT_SECRET: string; PUBLIC_ORIGIN?: string },
  requestUrl: string,
  mode: GoogleMode,
  linkTo?: string
): Promise<string> {
  const nonce = crypto.randomUUID()
  const state = await sign(
    { mode, link_to: linkTo, nonce, exp: Math.floor(Date.now() / 1000) + STATE_TTL },
    env.JWT_SECRET
  )

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(env, requestUrl),
    response_type: 'code',
    scope: 'openid', // sub だけ。email も profile も要求しない
    state,
    // 毎回アカウントを選ばせる（複数アカウント持ちが意図しない方で連携する事故を防ぐ）
    prompt: 'select_account',
  })

  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export async function verifyState(secret: string, state: string): Promise<StatePayload | null> {
  try {
    return (await verify(state, secret, 'HS256')) as unknown as StatePayload
  } catch {
    return null
  }
}

/** JWT のペイロード部だけを取り出す。
 * 署名検証はしない ── このトークンは Google のトークンエンドポイントから
 * TLS 越しに直接受け取ったものなので、経路自体が真正性を担保している。 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
    return JSON.parse(atob(b64 + pad))
  } catch {
    return null
  }
}

/**
 * 認可コードを ID トークンに交換し、sub を取り出す。
 * @returns 失敗なら null
 */
export async function exchangeCodeForSub(
  env: { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; PUBLIC_ORIGIN?: string },
  requestUrl: string,
  code: string
): Promise<string | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(env, requestUrl),
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    // 本文には client_secret は含まれないが、エラー種別の特定に要るので出す
    console.error('google token exchange failed:', res.status, await res.text())
    return null
  }

  const data = (await res.json()) as { id_token?: string }
  if (!data.id_token) return null

  const payload = decodeJwtPayload(data.id_token)
  if (!payload) return null

  // 経路は信頼できるが、宛先と発行者だけは確認しておく
  // （設定ミスで他プロジェクト向けのトークンを受け入れてしまう事故を防ぐ）
  const aud = payload.aud
  const iss = payload.iss
  if (aud !== env.GOOGLE_CLIENT_ID) {
    console.error('google id_token aud mismatch')
    return null
  }
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
    console.error('google id_token iss mismatch:', iss)
    return null
  }

  const sub = payload.sub
  return typeof sub === 'string' && sub.length > 0 ? sub : null
}

/** 未登録の Google アカウントを、登録画面へ引き継ぐための署名済みトークン。
 * こちらも署名のみで中身は読める。google_sub が読めても、署名できなければ
 * 登録には使えない（/register が verifySignupToken で検証する）。 */
export async function signSignupToken(secret: string, googleSub: string): Promise<string> {
  return sign({ google_sub: googleSub, exp: Math.floor(Date.now() / 1000) + STATE_TTL }, secret)
}

export async function verifySignupToken(secret: string, token: string): Promise<string | null> {
  try {
    const payload = (await verify(token, secret, 'HS256')) as unknown as SignupPayload
    return typeof payload.google_sub === 'string' ? payload.google_sub : null
  } catch {
    return null
  }
}
