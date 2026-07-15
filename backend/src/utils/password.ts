/* ============================================================
 * パスワードのハッシュ化。ここが唯一の正。
 *
 * 【なぜ作ったか】
 * 以前は「ソルト無しの SHA-256 を1回」だった（auth.ts のコメントも
 * "実際の運用ではbcryptやソルト付きを推奨" と自白していた）。
 * ソルト無しの高速ハッシュはレインボーテーブルで実質即死で、
 * 利用者がパスワードを使い回していれば被害が他サービスへ波及する。
 *
 * 【方式】
 * PBKDF2-HMAC-SHA256 / 100,000回 / ソルト16バイト / 出力32バイト。
 *
 * bcrypt/argon2 を使っていないのは、Workers がネイティブモジュールを
 * 読めないため。PBKDF2 は WebCrypto に標準で入っており、Workers でも
 * Node（テスト環境）でも同じコードが動く。
 *
 * 【反復回数が 100,000 で頭打ちな理由】
 * OWASP は PBKDF2-HMAC-SHA256 に 600,000回 を推奨しているが、
 * Cloudflare Workers の本番ランタイムはそれを受け付けない:
 *   Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000).
 * これは CPU 時間の制約でもプランの制約でもなく、API のハード上限。
 *
 * ★ローカル(miniflare)も Node(vitest)もこの上限を課さない。
 *   そのため 600,000回 は手元では全て通り、本番でだけ 500 になった
 *   （実際に登録が全滅した）。ここを上げるときは必ず本番で叩いて確かめること。
 *   下の MAX_WORKERS_ITERATIONS と test/password.test.ts が再発を止める。
 *
 * 100,000回は推奨値を下回るが、レインボーテーブルを無効化するのはソルトであり、
 * 反復回数は「DBが盗まれた後の総当たりを遅くする」追加の保険。
 * 無ソルト SHA-256 の1回だった以前からは桁違いに堅い。
 * さらに強くするなら nodejs_compat を有効にして node:crypto の scrypt を使う手がある。
 *
 * 【保存形式】
 *   pbkdf2$<iterations>$<salt_b64>$<hash_b64>
 * 先頭に方式と反復回数を持たせてあるので、後から回数を変えても
 * 既存の行を読めなくならない（照合は行に書かれた回数で行う）。
 * ============================================================ */

const ALGO = 'pbkdf2'

/** Cloudflare Workers が受け付ける PBKDF2 反復回数の上限。
 * これを超えると本番でだけ実行時エラーになる（ローカルでは再現しない）。 */
export const MAX_WORKERS_ITERATIONS = 100_000

const ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BITS = 256

const enc = new TextEncoder()

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    HASH_BITS
  )
  return new Uint8Array(bits)
}

/** 定数時間で比較する。
 * crypto.subtle.timingSafeEqual は Cloudflare 独自の非標準拡張で Node には無いため、
 * 存在すれば使い、無ければ移植可能な実装に落とす（テストは Node で動く）。 */
function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  const subtle = crypto.subtle as unknown as {
    timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean
  }
  if (typeof subtle.timingSafeEqual === 'function') return subtle.timingSafeEqual(a, b)
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** 旧方式（ソルト無し SHA-256 の hex 64文字）の判定。
 * 新方式は必ず 'pbkdf2$' で始まるので取り違えない。 */
function isLegacyHash(stored: string): boolean {
  return /^[0-9a-f]{64}$/.test(stored)
}

async function legacySha256Hex(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 保存用のハッシュ文字列を作る */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await pbkdf2(password, salt, ITERATIONS)
  return `${ALGO}$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

export type VerifyResult = {
  ok: boolean
  /** 旧方式で保存されていた場合 true。呼び出し側は新方式へ書き換えること。 */
  needsUpgrade: boolean
}

/**
 * 保存済みハッシュと平文を照合する。
 *
 * 旧方式（ソルト無し SHA-256）で保存された行もここで受け入れ、needsUpgrade を立てて返す。
 * 認証に成功した時だけ新方式へ書き換えれば、利用者に再設定を強いずに移行できる。
 */
export async function verifyPassword(stored: string, password: string): Promise<VerifyResult> {
  if (!stored) return { ok: false, needsUpgrade: false }

  if (isLegacyHash(stored)) {
    const legacy = await legacySha256Hex(password)
    return { ok: safeEqual(enc.encode(legacy), enc.encode(stored)), needsUpgrade: true }
  }

  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== ALGO) return { ok: false, needsUpgrade: false }

  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations <= 0) return { ok: false, needsUpgrade: false }

  // 上限を超える回数で保存された行は、本番では検証そのものが例外になる。
  // 黙って「パスワードが違う」として返すと原因不明のロックアウトになるので、
  // ここで明示的に落として記録する。
  // （100,000 超で保存できてしまった時期は無いはずだが、ローカルは上限を課さないため
  //   手元のDBには存在しうる。その状態を本番へ持ち込めば必ずここに来る）
  if (iterations > MAX_WORKERS_ITERATIONS) {
    console.error(
      `password hash has ${iterations} iterations, but Workers supports at most ${MAX_WORKERS_ITERATIONS}. ` +
      `この行は本番で照合できない。`
    )
    return { ok: false, needsUpgrade: false }
  }

  try {
    const salt = fromB64(parts[2])
    const expected = fromB64(parts[3])
    // 反復回数は行に書かれた値を使う。後から ITERATIONS を変えても古い行を照合できる。
    const actual = await pbkdf2(password, salt, iterations)
    return { ok: safeEqual(actual, expected), needsUpgrade: iterations < ITERATIONS }
  } catch {
    return { ok: false, needsUpgrade: false }
  }
}
