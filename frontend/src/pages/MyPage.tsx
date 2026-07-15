import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; // Reusing cyber theme CSS
import { UnitImage } from '../components/UnitImage';
import { Modal } from '../components/Modal';

interface User {
  id: string;
  handle_name: string;
  chara_name: string;
  unit_id: number;
  money: number;
  exp: number;
  level: number;
  fame: number;
  is_admin: number;
  status_intuition: number;
  status_piloting: number;
  status_short_range: number;
  status_mid_range: number;
  status_long_range: number;
  unit_name: string;
  unit_image: string | null;
  current_hp: number;
  max_hp: number;
  current_en: number;
  max_en: number;
  active_tokusyu_list?: string[];
  unit_custom_armor: number;
  unit_custom_mobility: number;
  unit_custom_sensor: number;
  
  // --- /me が返す拡張プロパティ（P17で実データ配線済み） ---
  rank?: string;
  next_exp?: number;
  skills?: string[];
  traits?: Record<string, number>;
  total_battles?: number;
  win_battles?: number;

  weapon_name?: string;
  weapon_dmg?: number;
  weapon_en_cost?: number;
  item1_name?: string;
  item2_name?: string;
  weapon_id?: number;
  item1_id?: number;
  item2_id?: number;
  current_weight?: number;
  max_weight?: number;
  weapon_weight?: number;
  item1_weight?: number;
  item2_weight?: number;
  unit_custom_lp?: number;
  unit_kaisyo?: number;
  cost?: number;
  movement?: number;
  max_kaisyo?: number;
  max_kaisyo_ex?: number;

  terrain_ground?: number;
  terrain_water?: number;
  terrain_space?: number;
  terrain_air?: number;

  /** Google 連携済みか。sub 自体はサーバーから返さない（識別子なので） */
  google_linked?: boolean;
  has_password?: boolean;
}

export const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [sysMsg, setSysMsg] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [showInventory, setShowInventory] = useState(false);
  const [targetSlot, setTargetSlot] = useState<'weapon_id' | 'item1_id' | 'item2_id' | null>(null);

  // チームメンバー（実データ: /api/squad）
  const [squad, setSquad] = useState<any[]>([]);
  // 機体解説モーダル
  const [showUnitDesc, setShowUnitDesc] = useState(false);

  // 参戦者リストと変形先リスト
  const [participants, setParticipants] = useState<any[]>([]);
  const [transformTargets, setTransformTargets] = useState<any[]>([]);
  const [isChampion, setIsChampion] = useState(false);
  const [linking, setLinking] = useState(false);

  /** Google 連携を開始する。
   * Google へのリダイレクトでは Authorization ヘッダを運べないので、
   * 先に認証付きでこのAPIを叩いて署名済みのURLを作ってもらい、そこへ飛ぶ。 */
  const handleLinkGoogle = async () => {
    setLinking(true);
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/auth/google/link-start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as any;
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.message || 'Google 連携を開始できませんでした');
        setLinking(false);
      }
    } catch {
      setError('Google 連携を開始できませんでした');
      setLinking(false);
    }
  };

  // 現優勝者なら整備で「優勝戦反映」を出す
  useEffect(() => {
    if (!user?.id) return;
    const token = localStorage.getItem('gtactics_token');
    fetch('/api/champion', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: any) => setIsChampion(d?.individual?.champion_id === user.id || d?.team?.champion_id === user.id || d?.is_defender === true))
      .catch(() => {});
  }, [user]);

  const fetchParticipantsAndTransforms = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const [pRes, tRes] = await Promise.all([
        fetch('/api/participants', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/hangar/transform_targets', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      const pData = await pRes.json() as any;
      if (pData.success) setParticipants(pData.participants);
      const tData = await tRes.json() as any;
      if (tData.success) setTransformTargets(tData.targets);
    } catch (err) {}
  };

  const fetchSquad = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/squad', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = (await res.json()) as any;
      if (data.success) setSquad(data.squad);
    } catch (err) {}
  };

  const fetchInventory = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/inventory', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await res.json()) as any;
      if (data.success) setInventory(data.inventory);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenInventory = (slot: 'weapon_id' | 'item1_id' | 'item2_id') => {
    setTargetSlot(slot);
    setShowInventory(true);
    fetchInventory();
  };

  const handleEquip = async (inventoryId: number | null) => {
    if (!targetSlot) return;
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/equip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ inventory_id: inventoryId, slot: targetSlot })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        setShowInventory(false);
        fetchMe(); // 装備変更後に再取得
      } else {
        setError(data.message);
      }
    } catch (err) {
      console.error(err);
      setError('通信エラー');
    }
    setTimeout(() => setError(''), 3000);
    setTimeout(() => setSysMsg(''), 3000);
  };

  const fetchMe = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) {
      navigate('/');
      return;
    }

    try {
      const response = await fetch('/api/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = (await response.json()) as any;
      if (data.success) {
        setUser(data.user);
      } else {
        localStorage.removeItem('gtactics_token');
        navigate('/');
      }
    } catch (err) {
      console.error(err);
      setError('サーバーに接続できません。時間をおいて再読み込みしてください。');
    }
  };

  useEffect(() => {
    fetchMe();
    fetchSquad();
    fetchParticipantsAndTransforms();
  }, [navigate]);

  // 機体整備（原作 action.cgi seibi。コストはサーバー側で原作式＋器用割引を計算）
  const handleRepair = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/seibi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        fetchMe(); // HP/EN/所持金を再取得
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('整備処理に失敗しました');
    }
    setTimeout(() => setSysMsg(''), 3000);
    setTimeout(() => setError(''), 3000);
  };

  // 優勝機体の整備（防衛耐久を回復・優勝戦反映）
  const handleChampionRepair = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/seibi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ update_champion: true })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        fetchMe();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('優勝機体の整備に失敗しました');
    }
    setTimeout(() => setSysMsg(''), 3000);
    setTimeout(() => setError(''), 3000);
  };

  const handleTeamRepair = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/team_seibi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        fetchMe();
        fetchSquad();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('チーム整備に失敗しました');
    }
    setTimeout(() => setSysMsg(''), 3000);
    setTimeout(() => setError(''), 3000);
  };

  const handleTransform = async (targetUnitId: number) => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/hangar/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ target_unit_id: targetUnitId })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        fetchMe();
        fetchParticipantsAndTransforms();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('変形処理に失敗しました');
    }
    setTimeout(() => setSysMsg(''), 3000);
    setTimeout(() => setError(''), 3000);
  };

  if (error) return <div className="register-container"><div className="error-message">{error}</div></div>;
  if (!user) return <div className="register-container"><div style={{ color: '#00f2fe' }}>INITIALIZING CONNECTION...</div></div>;

  const hpPercent = Math.max(0, Math.min(100, (user.current_hp / user.max_hp) * 100));
  const enPercent = Math.max(0, Math.min(100, (user.current_en / user.max_en) * 100));

  // 戦績（P16）: 実データから敗数・勝率を算出。0戦時は 0% とする
  const totalBattles = user.total_battles || 0;
  const winBattles = user.win_battles || 0;
  const loseBattles = Math.max(0, totalBattles - winBattles);
  const winRate = totalBattles > 0 ? ((winBattles / totalBattles) * 100).toFixed(1) : '0.0';

  return (
    <div className="register-container">
      <div className="glass-panel" style={{ maxWidth: 'var(--content-max)', width: '100%' }}>

        {/* HEADER
         * ログアウト・管理画面・未読伝言バッジは AppLayout のヘッダーへ移した
         * （どのページからでも触れる必要があるため）。ここに残すのはこの画面固有の操作だけ。 */}
        <div className="page-head">
          <div>
            <h1 className="cyber-title" style={{ fontSize: '1.5rem', textAlign: 'left', marginBottom: 0 }}>
              {user.handle_name}【{user.rank || '-'}】
            </h1>
            {(user as any).faction_notice && (
              <div style={{ fontSize: '0.9rem', color: 'var(--success)', marginTop: '0.35rem' }}>
                【{(user as any).faction_name}より通達】{(user as any).faction_notice}
              </div>
            )}
          </div>
          {/* プロフィール変更・キャラ削除は、ヘッダー右上のユーザーメニュー →
            * アカウント設定 / プロフィール変更 に集約した。ここには置かない。 */}
        </div>

        {/* Google 未連携なら勧める。
          * このゲームにはパスワードの再設定手段が無い（メールアドレスを集めていないため）。
          * Google を連携しておくことが、事実上ただ一つの復旧手段になる。 */}
        {user.google_linked === false && (
            <div className="link-google-banner">
              <div>
                <b>Google アカウントを連携しませんか？</b>
                <span>パスワードを忘れた場合、連携していないと復旧できません。次回からは1クリックでログインできるようになります。</span>
              </div>
              <button className="google-btn" style={{ width: 'auto' }} onClick={handleLinkGoogle} disabled={linking}>
                <svg viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                {linking ? '接続中…' : 'Google を連携する'}
              </button>
            </div>
        )}

        {sysMsg && (
          <div style={{ background: 'rgba(72, 187, 120, 0.2)', color: '#48bb78', padding: '10px', borderRadius: '4px', marginBottom: '1rem', border: '1px solid #48bb78', textAlign: 'center' }}>
            {sysMsg}
          </div>
        )}

        {/* PARTICIPANTS */}
        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
          <div style={{ color: '#aaa', marginBottom: '5px' }}>参戦者リスト (直近ログイン/戦闘)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {participants.length > 0 ? participants.map((p, i) => (
              <span key={i} 
                onClick={() => navigate(`/profile/${p.id}`)}
                style={{ color: p.faction_color || '#4bc8ff', background: 'rgba(75, 200, 255, 0.1)', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer' }}
                title="プロフィールを見る"
              >
                {p.handle_name} <span style={{ color: '#888' }}>({p.unit_name})</span>
              </span>
            )) : <span style={{ color: '#888' }}>該当なし</span>}
          </div>
        </div>

        {/* MAIN LAYOUT - 2 COLUMNS（900px 以下では1カラムに畳む） */}
        <div className="grid-2" style={{ marginBottom: '20px' }}>

          {/* LEFT COLUMN: UNIT DATA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* PILOT SUMMARY */}
            <div className="stats-allocation" style={{ margin: 0 }}>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <div style={{ width: '60px', height: '60px', background: '#333', border: '1px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#888' }}>
                  画像
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', color: '#4facfe' }}>{user.chara_name}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{user.handle_name}</div>
                </div>
                <div style={{ display: 'flex', gap: '15px', textAlign: 'right' }}>
                  <div><div style={{ fontSize: '0.7rem', color: '#888' }}>名声</div><div style={{ color: '#ecc94b' }}>{user.fame}</div></div>
                  <div><div style={{ fontSize: '0.7rem', color: '#888' }}>ポイント</div><div style={{ color: '#ecc94b' }}>{user.money.toLocaleString()}</div></div>
                  <div><div style={{ fontSize: '0.7rem', color: '#888' }}>熟練度</div><div style={{ color: '#fff' }}>{user.level}</div></div>
                </div>
              </div>
            </div>

            {/* UNIT DETAILS */}
            <div className="stats-allocation" style={{ margin: 0, flex: 1 }}>
              <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem', textAlign: 'center' }}>搭乗機体データ</h3>
              
              <div className="row-wrap" style={{ gap: '20px' }}>
                {/* Unit Image & Actions */}
                <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ width: '120px', height: '120px', background: 'rgba(0,0,0,0.5)', border: '1px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {user.unit_image ? (
                      <UnitImage file={user.unit_image} alt={user.unit_name || 'Unit'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ color: '#888', fontSize: '0.8rem' }}>No Image</span>
                    )}
                  </div>
                  <button onClick={handleRepair} className="submit-btn" style={{ padding: '8px', fontSize: '0.8rem', margin: 0, background: '#2c5282' }}>
                    機体を整備<br/><span style={{ color: '#90cdf4' }}>（コストは階級・LP依存）</span>
                  </button>
                  {isChampion && (
                    <button onClick={handleChampionRepair} className="submit-btn" style={{ padding: '8px', fontSize: '0.8rem', margin: 0, background: '#744210' }}>
                      防衛データを整備<br/><span style={{ color: '#f6e05e' }}>（防衛耐久を回復・優勝/防衛データへ反映）</span>
                    </button>
                  )}
                  {transformTargets.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {transformTargets.map((t: any) => (
                        <button key={t.transform_id} onClick={() => handleTransform(t.unit_id)} className="submit-btn" style={{ padding: '4px', fontSize: '0.75rem', margin: 0, background: '#d69e2e', color: '#fff' }}>
                          変形({t.name})
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unit Stats（幅が足りなくなったら画像の下へ回り込ませる） */}
                <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="kv-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>ユニット</span>
                    <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{user.unit_name}</span>
                    <button onClick={() => setShowUnitDesc(true)} className="mini-btn">機体解説</button>
                  </div>
                  <div className="kv-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>武器</span>
                    <span>{user.weapon_name || 'なし'}</span>
                    <button onClick={() => handleOpenInventory('weapon_id')} className="mini-btn">武器搭載</button>
                  </div>
                  <div className="kv-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>装備1</span>
                    <span>{user.item1_name || 'なし'}</span>
                    <button onClick={() => handleOpenInventory('item1_id')} className="mini-btn">装備1搭載</button>
                  </div>
                  <div className="kv-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>装備2</span>
                    <span>{user.item2_name || 'なし'}</span>
                    <button onClick={() => handleOpenInventory('item2_id')} className="mini-btn">装備2搭載</button>
                  </div>
                  
                  {/* Grid Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '5px' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                        <span>耐久力</span><span>{Math.floor(user.current_hp)}/{Math.floor(user.max_hp)}</span>
                      </div>
                      <div style={{ height: '4px', background: '#222', marginTop: '2px' }}><div style={{ height: '100%', width: `${hpPercent}%`, background: '#4bff7d' }}></div></div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                        <span>EN</span><span>{Math.floor(user.current_en)}/{Math.floor(user.max_en)}</span>
                      </div>
                      <div style={{ height: '4px', background: '#222', marginTop: '2px' }}><div style={{ height: '100%', width: `${enPercent}%`, background: '#3182ce' }}></div></div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#888' }}>運動</span><span>{user.unit_custom_mobility}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#888' }}>索敵</span><span>{user.unit_custom_sensor}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#888' }}>装甲</span><span>{user.unit_custom_armor}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#888' }}>改造回数</span><span>{user.unit_custom_lp ?? 0}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#888' }}>移動力</span><span style={{ color: '#4facfe' }}>{user.movement ?? '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#888' }}>コスト</span><span style={{ color: '#f6ad55' }}>{user.cost ?? '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#888' }}>機熟</span><span style={{ color: '#4bff7d' }}>{user.unit_kaisyo ?? 0} <span style={{ color: '#888' }}>/{user.max_kaisyo ?? 0}/{user.max_kaisyo_ex ?? 0}</span></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#888' }}>装備重量</span><span>{user.current_weight}/{user.max_weight}</span>
                    </div>
                  </div>

                  {/* Terrain */}
                  <div className="chip-row" style={{ marginTop: '10px', background: 'var(--panel-inset)', padding: '6px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>機体の適性</span>
                    <span>【地上】{user.terrain_ground ?? '-'}</span>
                    <span>【水中】{user.terrain_water ?? '-'}</span>
                    <span>【宇宙】{user.terrain_space ?? '-'}</span>
                    <span>【空中】{user.terrain_air ?? '-'}</span>
                  </div>

                  {/* Active Tokusyu */}
                  <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.3)', padding: '5px', borderRadius: '4px', fontSize: '0.8rem' }}>
                    <div style={{ color: '#888', marginBottom: '4px' }}>発動特殊能力</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {user.active_tokusyu_list && user.active_tokusyu_list.length > 0 ? (
                        user.active_tokusyu_list.map((t: string, i: number) => (
                          <span key={i} style={{ color: '#ecc94b', background: 'rgba(236, 201, 75, 0.1)', padding: '2px 4px', borderRadius: '2px' }}>
                            {t}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: '#555' }}>なし</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: PILOT DATA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="stats-allocation" style={{ margin: 0, flex: 1 }}>
              <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem', textAlign: 'center' }}>搭乗者能力</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '2px' }}><span style={{ color: '#888' }}>直感</span><span>{user.status_intuition}</span></div>
                  <div style={{ height: '4px', background: '#222' }}><div style={{ height: '100%', width: `${Math.min(100, user.status_intuition)}%`, background: '#4facfe' }}></div></div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '2px' }}><span style={{ color: '#888' }}>操縦</span><span>{user.status_piloting}</span></div>
                  <div style={{ height: '4px', background: '#222' }}><div style={{ height: '100%', width: `${Math.min(100, user.status_piloting)}%`, background: '#4facfe' }}></div></div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '2px' }}><span style={{ color: '#888' }}>近距離</span><span>{user.status_short_range}</span></div>
                  <div style={{ height: '4px', background: '#222' }}><div style={{ height: '100%', width: `${Math.min(100, user.status_short_range)}%`, background: '#4facfe' }}></div></div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '2px' }}><span style={{ color: '#888' }}>中距離</span><span>{user.status_mid_range}</span></div>
                  <div style={{ height: '4px', background: '#222' }}><div style={{ height: '100%', width: `${Math.min(100, user.status_mid_range)}%`, background: '#4facfe' }}></div></div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '2px' }}><span style={{ color: '#888' }}>遠距離</span><span>{user.status_long_range}</span></div>
                  <div style={{ height: '4px', background: '#222' }}><div style={{ height: '100%', width: `${Math.min(100, user.status_long_range)}%`, background: '#4facfe' }}></div></div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '2px' }}><span style={{ color: '#888' }}>経験点</span><span>{user.exp}/{user.next_exp ?? '-'}</span></div>
                  <div style={{ height: '4px', background: '#222' }}><div style={{ height: '100%', width: `${user.next_exp ? Math.min(100, (user.exp / user.next_exp) * 100) : 0}%`, background: '#ecc94b' }}></div></div>
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex' }}>
                  <div style={{ width: '60px', color: '#888', fontSize: '0.9rem' }}>スキル</div>
                  <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {user.skills?.map((s, i) => <span key={i} style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem', color: s.includes('NT') ? '#f6ad55' : '#fff' }}>{s}</span>)}
                  </div>
                </div>
                <div style={{ display: 'flex' }}>
                  <div style={{ width: '60px', color: '#888', fontSize: '0.9rem' }}>特性</div>
                  <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {Object.entries(user.traits || {}).map(([t, lv], i) => <span key={i} style={{ background: 'rgba(155,89,182,0.2)', color: '#d6bcfa', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{t}{lv > 1 ? `LV${lv}` : ''}</span>)}
                  </div>
                </div>
                <div className="kv-row" style={{ marginTop: '10px', background: 'var(--panel-inset)', padding: '8px', borderRadius: '4px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>戦闘</span>
                  <span>{winBattles}勝{loseBattles}敗</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginLeft: 'auto' }}>勝率</span>
                  <span>{winRate}%</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* BOTTOM SECTIONS */}
        <div className="grid-2" style={{ marginBottom: '20px' }}>

          {/* TEAM MEMBERS（実データ: /api/squad） */}
          <div className="stats-allocation" style={{ margin: 0 }}>
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#aaa', fontSize: '0.9rem', margin: 0 }}>チームメンバー（{squad.length}/4）</h3>
              {squad.length > 0 && (
                <button onClick={handleTeamRepair} className="submit-btn" style={{ padding: '4px 8px', fontSize: '0.75rem', margin: 0, background: '#2c5282' }}>チームを整備</button>
              )}
            </div>
            {squad.length === 0 ? (
              <div style={{ color: '#888', textAlign: 'center', padding: '0.8rem', fontSize: '0.9rem' }}>
                編成されていません。<button onClick={() => navigate('/team')} className="text-btn" style={{ fontSize: '0.85rem' }}>チーム編成へ</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {squad.map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', fontSize: '0.9rem', gap: '10px' }}>
                    <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    <div style={{ color: '#4bff7d' }}>{m.unit_name}</div>
                    <div style={{ color: '#aaa', fontSize: '0.8rem' }}>Lv.{m.level}</div>
                    <div style={{ color: '#aaa', fontSize: '0.8rem' }}>HP{m.hp}/EN{m.en}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* COMBAT ACTIONS */}
          <div className="stats-allocation" style={{ margin: 0 }}>
            <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem', textAlign: 'center' }}>【 戦闘メニュー 】</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <button onClick={() => navigate('/battle')} className="submit-btn" style={{ padding: '12px 15px', margin: 0, fontSize: '1rem', fontWeight: 'bold', width: '100%' }}>出撃 (優勝戦・防衛戦)</button>
              <button onClick={() => navigate('/simulator')} className="submit-btn" style={{ padding: '8px 15px', margin: 0, fontSize: '0.8rem', background: '#2c5282', width: '100%' }}>シミュレーターへ移動</button>
            </div>
            <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '0.8rem', color: '#888' }}>
              ※シミュレーターは模擬戦専用です（戦績・報酬なし）
            </div>
          </div>
        </div>

        {/* かつてここに repeat(13, 1fr) のボタングリッドがあり、それが実質のグローバルナビだった。
         * 13等分でラベルが「フラ/ナガ/ン機/関」に割れ、他ページからは戻れず、現在地も分からなかった。
         * 行き先は AppLayout のサイドバー（モバイルはドロワー）に集約したのでここには置かない。 */}
      </div>

      {/* 機体解説モーダル */}
      <Modal
        open={showUnitDesc}
        onClose={() => setShowUnitDesc(false)}
        title={user.unit_name}
        actions={<button className="text-btn" onClick={() => setShowUnitDesc(false)}>閉じる</button>}
      >
        {user.unit_image && (
          <UnitImage file={user.unit_image} alt={user.unit_name} style={{ maxWidth: '160px', display: 'block', margin: '0 auto 1rem' }} />
        )}
        <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          {(user as any).unit_description || 'この機体の解説データはありません。'}
        </div>
      </Modal>

      {/* Inventory Modal */}
      <Modal
        open={showInventory}
        onClose={() => setShowInventory(false)}
        title="装備を選ぶ"
        size="md"
        actions={<button className="text-btn" onClick={() => setShowInventory(false)}>閉じる</button>}
      >
        <button
          className="submit-btn"
          onClick={() => handleEquip(null)}
          style={{ width: '100%', marginBottom: '1rem', marginTop: 0, background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}
        >
          現在の装備を外す
        </button>

        {/* 表は狭い画面で縮まないので、単体で横スクロールさせる */}
        <div className="scroll-x">
          <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)', textAlign: 'left' }}>
                <th style={{ padding: '0.8rem' }}>アイテム名</th>
                <th style={{ padding: '0.8rem' }}>種別</th>
                <th style={{ padding: '0.8rem', textAlign: 'center' }}>重量</th>
                <th style={{ padding: '0.8rem', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
                {inventory.map(item => (
                  <tr key={item.inventory_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ padding: '0.8rem' }}>
                      <div style={{ color: '#4bc8ff', fontWeight: 'bold' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#aaa' }}>{item.description}</div>
                    </td>
                    <td style={{ padding: '0.8rem', color: '#ecc94b' }}>
                      {item.item_type >= 1 && item.item_type <= 5 ? '武器' : '装備'}
                    </td>
                    <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                      {item.weight}
                    </td>
                    <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                      {(() => {
                        const isCorrectSlot = (targetSlot === 'weapon_id' && item.item_type >= 1 && item.item_type <= 5) || 
                                              (targetSlot !== 'weapon_id' && !(item.item_type >= 1 && item.item_type <= 5));
                        
                        const currentWeaponWeight = targetSlot === 'weapon_id' ? 0 : (user.weapon_weight || 0);
                        const currentItem1Weight = targetSlot === 'item1_id' ? 0 : (user.item1_weight || 0);
                        const currentItem2Weight = targetSlot === 'item2_id' ? 0 : (user.item2_weight || 0);
                        const newWeight = currentWeaponWeight + currentItem1Weight + currentItem2Weight + (item.weight || 0);
                        const isOverWeight = newWeight > (user.max_weight || 0);

                        if (!isCorrectSlot) {
                          return <span style={{ fontSize: '0.8rem', color: '#666' }}>装備不可</span>;
                        }
                        if (isOverWeight) {
                          return <span style={{ fontSize: '0.8rem', color: '#e53e3e' }}>重量超過</span>;
                        }
                        return (
                          <button 
                            onClick={() => handleEquip(item.inventory_id)}
                            style={{ padding: '0.4rem 0.8rem', background: 'transparent', border: '1px solid #4bc8ff', color: '#4bc8ff', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            装備
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              {inventory.length === 0 && (
                <tr>
                  {/* 列は4つ。以前は colSpan=3 で、空メッセージが「操作」列の下に潜り込んでいた */}
                  <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    インベントリにアイテムがありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
};

