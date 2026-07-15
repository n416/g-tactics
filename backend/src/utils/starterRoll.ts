import { sign, verify } from 'hono/jwt'

/* ============================================================
 * 初期機体のルーレット。
 *
 * 【なぜサーバーで抽選して署名するのか】
 * 以前の /register は unit_id を検証せず `unit_id || 0` でそのまま使っていたため、
 * 任意の機体（終盤機体を含む）で登録できてしまった。フロントが4択のセレクトを
 * 出していただけで、サーバー側には許可リストが無かった。
 *
 * 抽選をクライアントでやると同じ穴が残る（結果を差し替えられる）ので、
 * 「サーバーが引いて署名し、登録時にその署名を検証する」形にする。
 * クライアントから送られてきた unit_id は一切信用しない。
 *
 * 【リロール回数について】
 * 回数は署名済みトークンの中に入れて持ち回るが、これは「硬い」制限ではない。
 * 登録前なので識別子が無く、トークンを捨てて roll を叩き直せば数え直せてしまう。
 * 塞ぐには IP 単位のレート制限（KV 等）が要る。
 *
 * ここは意図的に緩いままにしてある。無限リロールで起きる最悪の事態は
 * 「ボールではなくジムトレーナーで始まる」程度である一方、プールの穴は
 * 「終盤機体で始まる」なので、守る価値があるのは後者だけだと判断した。
 * ============================================================ */

/** 初期機体プール。
 *
 * 抽出条件: 名声・NT要求なし / 各ステ要求が10以下 / unit_lv <= 22。
 * この条件に id:9998「勢力機体」も該当するが、あれは勢力戦用のシステム機体
 * （画像が colony.gif）なので手で除外している。
 *
 * 増やすときは、上記条件を満たすことを units テーブルで確認してから足すこと。
 * 要求ステが 10 を超える機体を入れると、120ポイントの配分と噛み合わなくなる。 */
export const STARTER_UNIT_IDS = [
  0,   // ボール           HP150 装甲16 運動30 / 近距離10
  1,   // ボール・カスタム   HP160 装甲18 運動30 / 中距離10
  2,   // ザクＩ           HP175 装甲15 運動40 / 近距離10
  3,   // ザクタンク        HP160 装甲12 運動40 / 遠距離10
  249, // ジムトレーナー     HP190 装甲20 運動43 / 操縦10
  268, // ザクＩ改良型      HP190 装甲17 運動42 / 操縦10, 近距離10
  377, // ガンガル(バードモード) HP110 装甲10 運動40 / 要求なし ← ハズレ枠
  588, // プロトタイプ・ザク  HP135 装甲10 運動25 / 操縦10
] as const

/** 最初の1回に加えて引き直せる回数 */
export const MAX_REROLLS = 3

/** roll トークンの有効期限（秒）。登録画面を開きっぱなしにされても困らない程度に短く */
const ROLL_TOKEN_TTL = 30 * 60

export type RollPayload = {
  unit_id: number
  /** 通算の抽選回数。初回の抽選が 1 */
  rolls_used: number
  exp: number
}

/** 暗号論的乱数で1件選ぶ。
 * 剰余によるわずかな偏りは、母集団が8件・用途が初期機体である以上無視できる。 */
function pickRandom(candidates: readonly number[]): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return candidates[buf[0] % candidates.length]
}

/**
 * 抽選して署名済みトークンを返す。
 * @param prev 直前の抽選トークン。未指定なら初回。
 * @returns 上限に達している場合は null
 */
export async function rollStarterUnit(
  secret: string,
  prev?: string
): Promise<{ unit_id: number; rolls_used: number; rerolls_left: number; token: string } | null> {
  let rollsUsed = 0
  let prevUnitId: number | null = null

  if (prev) {
    try {
      const payload = (await verify(prev, secret, 'HS256')) as unknown as RollPayload
      rollsUsed = payload.rolls_used
      prevUnitId = payload.unit_id
    } catch {
      // 期限切れ・改竄は初回扱いに落とす。ここで弾いても、
      // トークンを捨てて叩き直されれば同じことなので厳格にする意味が無い。
      rollsUsed = 0
    }
  }

  if (rollsUsed >= 1 + MAX_REROLLS) return null

  // 引き直したのに同じ機体が出ると「壊れている」と受け取られるため、直前の1機だけ除く
  const candidates =
    prevUnitId === null
      ? STARTER_UNIT_IDS
      : STARTER_UNIT_IDS.filter((id) => id !== prevUnitId)

  const unit_id = pickRandom(candidates)
  const nextRollsUsed = rollsUsed + 1

  const token = await sign(
    {
      unit_id,
      rolls_used: nextRollsUsed,
      exp: Math.floor(Date.now() / 1000) + ROLL_TOKEN_TTL,
    },
    secret
  )

  return {
    unit_id,
    rolls_used: nextRollsUsed,
    rerolls_left: 1 + MAX_REROLLS - nextRollsUsed,
    token,
  }
}

/**
 * 登録時に roll トークンを検証して機体IDを取り出す。
 * これを通していない unit_id は受け付けない。
 */
export async function verifyRollToken(secret: string, token: string): Promise<number | null> {
  try {
    const payload = (await verify(token, secret, 'HS256')) as unknown as RollPayload
    if (typeof payload.unit_id !== 'number') return null
    // 署名済みでも、プールに無い値は拒否する（プールを縮めた後に古いトークンが来た場合）
    if (!STARTER_UNIT_IDS.includes(payload.unit_id as (typeof STARTER_UNIT_IDS)[number])) return null
    return payload.unit_id
  } catch {
    return null
  }
}
