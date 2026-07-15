import { describe, it, expect } from 'vitest'
import { pbkdf2Sync, randomBytes, createHash } from 'node:crypto'
import { hashPassword, verifyPassword } from '../src/utils/password'

describe('パスワードのハッシュ化', () => {
  it('ハッシュ化した値は元のパスワードで照合できる', async () => {
    const stored = await hashPassword('correct horse battery staple')
    const { ok, needsUpgrade } = await verifyPassword(stored, 'correct horse battery staple')
    expect(ok).toBe(true)
    expect(needsUpgrade).toBe(false)
  })

  it('違うパスワードでは照合できない', async () => {
    const stored = await hashPassword('password123')
    expect((await verifyPassword(stored, 'password124')).ok).toBe(false)
    expect((await verifyPassword(stored, '')).ok).toBe(false)
  })

  it('保存形式は pbkdf2$<反復回数>$<salt>$<hash>', async () => {
    const stored = await hashPassword('password123')
    const parts = stored.split('$')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('pbkdf2')
    // OWASP の PBKDF2-HMAC-SHA256 推奨値
    expect(Number(parts[1])).toBe(600_000)
  })

  it('同じパスワードでも毎回違うハッシュになる（ソルトが効いている）', async () => {
    const a = await hashPassword('samepassword')
    const b = await hashPassword('samepassword')
    expect(a).not.toBe(b)
    // それでも双方とも照合できる
    expect((await verifyPassword(a, 'samepassword')).ok).toBe(true)
    expect((await verifyPassword(b, 'samepassword')).ok).toBe(true)
  })

  it('日本語やマルチバイトのパスワードでも照合できる', async () => {
    const pw = 'パスワード🎲ザクⅠ'
    const stored = await hashPassword(pw)
    expect((await verifyPassword(stored, pw)).ok).toBe(true)
    expect((await verifyPassword(stored, 'パスワード')).ok).toBe(false)
  })

  it('壊れた保存値は例外を投げずに false を返す', async () => {
    for (const bad of ['', 'garbage', 'pbkdf2$', 'pbkdf2$abc$x$y', 'pbkdf2$600000$!!!$!!!', 'md5$1$a$b']) {
      const r = await verifyPassword(bad, 'password123')
      expect(r.ok).toBe(false)
    }
  })

  describe('旧方式（ソルト無し SHA-256）からの移行', () => {
    const legacyHash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

    it('旧方式で保存された行も照合でき、要アップグレードとして返る', async () => {
      const stored = legacyHash('password123')
      const { ok, needsUpgrade } = await verifyPassword(stored, 'password123')
      expect(ok).toBe(true)
      // 呼び出し側（login）がこれを見て新方式へ書き換える
      expect(needsUpgrade).toBe(true)
    })

    it('旧方式でもパスワードが違えば通らない', async () => {
      const stored = legacyHash('password123')
      expect((await verifyPassword(stored, 'wrong')).ok).toBe(false)
    })

    it('新方式のハッシュを旧方式と誤認しない', async () => {
      const stored = await hashPassword('password123')
      expect(stored.startsWith('pbkdf2$')).toBe(true)
      expect((await verifyPassword(stored, 'password123')).needsUpgrade).toBe(false)
    })
  })

  // make_admin.mjs は node:crypto の pbkdf2Sync で同じ形式のハッシュを作る。
  // 本体は WebCrypto を使うので実装が別物であり、ここがズレると
  // 「作った管理者がログインできない」という形で初めて発覚する。
  it('make_admin.mjs (node:crypto) が作るハッシュを本体が照合できる', async () => {
    const password = 'admin-password-123'
    const iterations = 600_000
    const salt = randomBytes(16)
    const hash = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256')
    const stored = `pbkdf2$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`

    const { ok } = await verifyPassword(stored, password)
    expect(ok).toBe(true)
    expect((await verifyPassword(stored, 'wrong-password')).ok).toBe(false)
  })

  it('反復回数を後から上げても、古い回数で保存された行を照合できる', async () => {
    // 将来 ITERATIONS を引き上げたときに既存行が読めなくならないことの担保
    const password = 'password123'
    const iterations = 100_000 // 現行より低い回数で保存された行を模す
    const salt = randomBytes(16)
    const hash = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256')
    const stored = `pbkdf2$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`

    const { ok, needsUpgrade } = await verifyPassword(stored, password)
    expect(ok).toBe(true)
    // 現行の回数より低いので、こちらも巻き取り対象になる
    expect(needsUpgrade).toBe(true)
  })
})
