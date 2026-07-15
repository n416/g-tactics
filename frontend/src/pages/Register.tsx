import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UnitImage } from '../components/UnitImage';
import './Register.css';

const MAX_TOTAL_POINTS = 120;
const MAX_STAT_POINTS = 70;

type Stats = {
  intuition: number;
  piloting: number;
  short_range: number;
  mid_range: number;
  long_range: number;
};

type RolledUnit = {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  hp: number;
  en: number;
  armor: number;
  mobility: number;
  sensor: number;
  req_intuition: number;
  req_piloting: number;
  req_short_range: number;
  req_mid_range: number;
  req_long_range: number;
};

type PoolUnit = { id: number; name: string; image: string | null };

const STAT_LABELS: Record<keyof Stats, string> = {
  intuition: '直感',
  piloting: '操縦',
  short_range: '近距離',
  mid_range: '中距離',
  long_range: '遠距離',
};

/** ステータスの要求値は units の req_* に対応する */
const REQ_KEY: Record<keyof Stats, keyof RolledUnit> = {
  intuition: 'req_intuition',
  piloting: 'req_piloting',
  short_range: 'req_short_range',
  mid_range: 'req_mid_range',
  long_range: 'req_long_range',
};

/* プリセット。
 * 【重要】どのプリセットも全ステを 10 以上にしてある。
 * 初期機体プールの搭乗条件は「1〜2個のステータスに 10」が最大なので、
 * この不変条件を守る限り、どの機体を引いてもプリセットは必ず条件を満たす。
 * プリセットを足すときは、合計 120 かつ全ステ 10 以上を維持すること。 */
const PRESETS: { key: string; label: string; hint: string; stats: Stats }[] = [
  {
    key: 'balanced',
    label: 'バランス型',
    hint: '尖らせず全距離に対応。迷ったらこれ',
    stats: { intuition: 24, piloting: 24, short_range: 24, mid_range: 24, long_range: 24 },
  },
  {
    key: 'melee',
    label: '近接型',
    hint: '近距離に全振り。懐に入って殴る',
    stats: { intuition: 15, piloting: 25, short_range: 50, mid_range: 20, long_range: 10 },
  },
  {
    key: 'sniper',
    label: '狙撃型',
    hint: '遠距離重視。離れて撃ち抜く',
    stats: { intuition: 20, piloting: 20, short_range: 10, mid_range: 25, long_range: 45 },
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 引いた機体の搭乗条件を満たすように底上げする。
 * 不足分は、最も高いステータスから削って回す（合計 120 を保つため）。 */
function ensureReqs(stats: Stats, unit: RolledUnit): Stats {
  const next = { ...stats };
  for (const key of Object.keys(next) as (keyof Stats)[]) {
    const req = (unit[REQ_KEY[key]] as number) || 0;
    while (next[key] < req) {
      // 一番余裕のあるステータスから 1 点借りる
      const donor = (Object.keys(next) as (keyof Stats)[])
        .filter((k) => k !== key)
        .sort((a, b) => next[b] - next[a])[0];
      if (!donor || next[donor] <= 0) break;
      next[donor] -= 1;
      next[key] += 1;
    }
  }
  return next;
}

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Google で認証済みの状態で来た場合、GoogleCallback が router の state で
  // 署名済みトークンを渡してくる（URL には載せない）。この場合パスワードは要らない。
  const googleToken = (location.state as { googleToken?: string } | null)?.googleToken;
  const isGoogle = !!googleToken;

  const [formData, setFormData] = useState({
    id: '',
    password: '',
    handle_name: '',
    chara_name: '',
  });

  const [stats, setStats] = useState<Stats>(PRESETS[0].stats);
  const [activePreset, setActivePreset] = useState<string | null>(PRESETS[0].key);
  const [showDetail, setShowDetail] = useState(false);

  // ルーレット
  const [unit, setUnit] = useState<RolledUnit | null>(null);
  const [rollToken, setRollToken] = useState('');
  const [rerollsLeft, setRerollsLeft] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [spinFace, setSpinFace] = useState<PoolUnit | null>(null);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const poolRef = useRef<PoolUnit[]>([]);
  const rolledOnce = useRef(false);

  const totalPoints = Object.values(stats).reduce((a, b) => a + b, 0);
  const remainingPoints = MAX_TOTAL_POINTS - totalPoints;

  /** 抽選する。結果はサーバーが署名して返すので、こちらは表示するだけ。 */
  const doRoll = useCallback(async (prevToken?: string) => {
    setError('');
    setSpinning(true);

    // 「回っている」絵。実際の抽選はサーバーなので、ここは純粋な演出。
    const spinTimer = setInterval(() => {
      const p = poolRef.current;
      if (p.length) setSpinFace(p[Math.floor(Math.random() * p.length)]);
    }, 70);

    const startedAt = Date.now();
    try {
      const res = await fetch('/api/register/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prevToken ? { token: prevToken } : {}),
      });
      const data = (await res.json()) as any;

      // 通信が速すぎると一瞬で切り替わって抽選に見えないので、最低限は回す
      await sleep(Math.max(0, 750 - (Date.now() - startedAt)));

      if (!data.success) {
        setError(data.message || '抽選に失敗しました');
        return;
      }

      setUnit(data.unit);
      setRollToken(data.token);
      setRerollsLeft(data.rerolls_left);
      // 引き直した機体の搭乗条件を満たしていなければ底上げする
      setStats((cur) => {
        const fixed = ensureReqs(cur, data.unit);
        const changed = (Object.keys(fixed) as (keyof Stats)[]).some((k) => fixed[k] !== cur[k]);
        if (changed) setActivePreset(null);
        return fixed;
      });
    } catch {
      setError('サーバーに接続できません');
    } finally {
      clearInterval(spinTimer);
      setSpinning(false);
    }
  }, []);

  useEffect(() => {
    // StrictMode の二重実行で抽選を2回消費しないようにする
    if (rolledOnce.current) return;
    rolledOnce.current = true;

    // プールは「回転中の絵」を本物の機体で見せるためだけに使う（描画は ref 経由）。
    // 取得に失敗しても抽選自体はサーバー側で完結するので、そのまま続行する。
    fetch('/api/register/pool')
      .then((r) => r.json())
      .then((d: any) => {
        if (d.success) poolRef.current = d.units;
      })
      .catch(() => {})
      .finally(() => doRoll());
  }, [doRoll]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const applyPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    setStats(unit ? ensureReqs(p.stats, unit) : p.stats);
    setActivePreset(key);
  };

  const handleStatChange = (statName: keyof Stats, value: number) => {
    const diff = value - stats[statName];
    if (value >= 0 && value <= MAX_STAT_POINTS && remainingPoints - diff >= 0) {
      setStats({ ...stats, [statName]: value });
      setActivePreset(null);
    }
  };

  /** 搭乗条件を満たしていないステータス（手動調整で割り込んだ場合のみ起きうる） */
  const unmetReq = unit
    ? (Object.keys(stats) as (keyof Stats)[])
        .map((k) => ({ key: k, req: (unit[REQ_KEY[k]] as number) || 0, got: stats[k] }))
        .find((x) => x.got < x.req)
    : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (formData.id.length < 4) {
      setError('IDは4文字以上で入力してください。');
      return;
    }
    if (!isGoogle && formData.password.length < 4) {
      setError('パスワードは4文字以上で入力してください。');
      return;
    }
    if (!formData.handle_name || !formData.chara_name) {
      setError('ハンドルネームとキャラクター名は必須です。');
      return;
    }
    if (!rollToken) {
      setError('初期機体が決まっていません。抽選し直してください。');
      return;
    }
    if (unmetReq) {
      setError(`${unit?.name} の搭乗には【${STAT_LABELS[unmetReq.key]}${unmetReq.req}】が必要です。`);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formData.id,
          handle_name: formData.handle_name,
          chara_name: formData.chara_name,
          // Google 経路ではパスワードを送らない（サーバー側もどちらか一方を要求する）
          ...(isGoogle ? { google_token: googleToken } : { password: formData.password }),
          status_intuition: stats.intuition,
          status_piloting: stats.piloting,
          status_short_range: stats.short_range,
          status_mid_range: stats.mid_range,
          status_long_range: stats.long_range,
          roll_token: rollToken,
        }),
      });

      const data = (await response.json()) as any;
      if (data.success && data.token) {
        // 登録した時点で本人確認は済んでいるので、そのままマイページへ入れる。
        // 待たせる意味も、ログイン画面へ送り返す意味も無い（Google 経路なら
        // たった今認証した Google をもう一往復させることになる）。
        // replace にして、戻るボタンで登録フォームへ帰らせない。
        localStorage.setItem('gtactics_token', data.token);
        navigate('/mypage', { replace: true });
      } else if (data.success) {
        // 互換: 何らかの理由でトークンが無い場合はログイン画面へ
        setSuccessMsg('キャラクターが作成されました。ログインしてください。');
        setTimeout(() => navigate('/'), 1500);
      } else {
        setError(data.message || '登録に失敗しました。');
      }
    } catch {
      setError('サーバーエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const face = spinning ? spinFace : unit;

  return (
    <div className="auth-container">
      <div className="glass-panel" style={{ maxWidth: '860px' }}>
        <h1 className="cyber-title">CHARACTER CREATION</h1>
        <p className="subtitle">G-Tactics</p>

        {error && <div className="error-message">{error}</div>}
        {successMsg && <div className="success-message">{successMsg}</div>}

        {isGoogle && (
          <div className="google-linked-note">
            ✓ Google アカウントで認証済みです。パスワードの設定は不要です。
          </div>
        )}

        <form onSubmit={handleSubmit} className="register-form">
          <div className="reg-cols">
            {/* 左: アカウントとキャラクター */}
            <div className="reg-fields">
              <div className="form-group">
                <label>ID <span className="req">*</span></label>
                <input type="text" name="id" value={formData.id} onChange={handleInputChange} maxLength={32} placeholder="4文字以上の英数字" autoComplete="username" />
                <span className="field-note">プロフィールのURLになります</span>
              </div>
              {/* Google で認証済みならパスワードは持たない（パスワードでのログインは不可になる） */}
              {!isGoogle && (
                <div className="form-group">
                  <label>パスワード <span className="req">*</span></label>
                  <input type="password" name="password" value={formData.password} onChange={handleInputChange} maxLength={128} placeholder="4文字以上" autoComplete="new-password" />
                </div>
              )}
              <div className="form-group">
                <label>ハンドルネーム <span className="req">*</span></label>
                <input type="text" name="handle_name" value={formData.handle_name} onChange={handleInputChange} maxLength={32} placeholder="あなたの名前" />
                <span className="field-note">ランキングや掲示板に出る、あなた自身の名前</span>
              </div>
              <div className="form-group">
                <label>キャラクター名 <span className="req">*</span></label>
                <input type="text" name="chara_name" value={formData.chara_name} onChange={handleInputChange} maxLength={32} placeholder="パイロット名" />
                <span className="field-note">機体に乗るパイロットの名前</span>
              </div>
            </div>

            {/* 右: 初期機体のルーレット */}
            <div className="reg-roulette">
              <div className="roulette-head">
                <span>初期機体</span>
                {!spinning && rerollsLeft > 0 && <span className="roulette-left">引き直し {rerollsLeft} 回</span>}
              </div>

              <div className={`roulette-frame ${spinning ? 'spinning' : ''}`}>
                {face ? (
                  <UnitImage file={face.image} alt={face.name} className="roulette-img" />
                ) : (
                  <span className="roulette-placeholder">抽選中…</span>
                )}
              </div>

              <div className="roulette-name">{face ? face.name : '—'}</div>

              {unit && !spinning && (
                <>
                  <div className="roulette-spec">
                    <span>HP <b>{unit.hp}</b></span>
                    <span>装甲 <b>{unit.armor}</b></span>
                    <span>運動 <b>{unit.mobility}</b></span>
                  </div>
                  {unit.description && <p className="roulette-desc">{unit.description}</p>}
                </>
              )}

              <button
                type="button"
                className="roulette-btn"
                onClick={() => doRoll(rollToken)}
                disabled={spinning || rerollsLeft <= 0}
              >
                {spinning ? '抽選中…' : rerollsLeft > 0 ? `🎲 引き直す（残り ${rerollsLeft}）` : '引き直しは終了'}
              </button>
            </div>
          </div>

          {/* ステータス */}
          <div className="reg-stats">
            <div className="reg-stats-head">
              <h3>ステータス</h3>
              <span className={`points-remaining ${remainingPoints === 0 ? 'empty' : ''}`}>
                残り {remainingPoints} / {MAX_TOTAL_POINTS}
              </span>
            </div>

            <div className="preset-row">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`preset-btn ${activePreset === p.key ? 'active' : ''}`}
                  onClick={() => applyPreset(p.key)}
                >
                  <b>{p.label}</b>
                  <span>{p.hint}</span>
                </button>
              ))}
            </div>

            <button type="button" className="detail-toggle" onClick={() => setShowDetail((v) => !v)}>
              {showDetail ? '▼ 詳細を閉じる' : '▶ 自分で振り分ける'}
            </button>

            {showDetail && (
              <div className="stats-grid">
                {(Object.keys(stats) as (keyof Stats)[]).map((key) => {
                  const req = unit ? (unit[REQ_KEY[key]] as number) || 0 : 0;
                  const below = stats[key] < req;
                  return (
                    <div key={key} className="stat-row">
                      <label>
                        {STAT_LABELS[key]}
                        {req > 0 && <span className={`stat-req ${below ? 'bad' : ''}`}>必要 {req}</span>}
                      </label>
                      <div className="stat-controls">
                        <button type="button" onClick={() => handleStatChange(key, stats[key] - 1)} disabled={stats[key] <= 0}>-</button>
                        <input
                          type="number"
                          value={stats[key]}
                          onChange={(e) => handleStatChange(key, parseInt(e.target.value) || 0)}
                          min={0}
                          max={MAX_STAT_POINTS}
                        />
                        <button type="button" onClick={() => handleStatChange(key, stats[key] + 1)} disabled={stats[key] >= MAX_STAT_POINTS || remainingPoints <= 0}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button type="submit" className="submit-btn" disabled={loading || spinning || !!unmetReq}>
            {loading ? 'PROCESSING...' : 'この機体で出撃する'}
          </button>

          <div className="form-footer">
            <button type="button" className="text-btn" onClick={() => navigate('/')}>キャンセル</button>
          </div>
        </form>
      </div>
    </div>
  );
};
