import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; // Reusing cyber theme CSS

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
}

export const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [sysMsg, setSysMsg] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [showInventory, setShowInventory] = useState(false);
  const [targetSlot, setTargetSlot] = useState<'weapon_id' | 'item1_id' | 'item2_id' | null>(null);

  // Private Messages
  const [unreadCount, setUnreadCount] = useState(0);

  // チームメンバー（実データ: /api/squad）
  const [squad, setSquad] = useState<any[]>([]);
  // 機体解説モーダル
  const [showUnitDesc, setShowUnitDesc] = useState(false);

  // 参戦者リストと変形先リスト
  const [participants, setParticipants] = useState<any[]>([]);
  const [transformTargets, setTransformTargets] = useState<any[]>([]);
  const [isChampion, setIsChampion] = useState(false);

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

  // 伝言の未読件数のみ取得（到着アラート＝赤ポチ用）。伝言記録の表示・既読化はステ詳細(Profile)へ集約。
  const fetchPrivateMessages = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const countRes = await fetch('/api/messages/private/unread-count', { headers: { 'Authorization': `Bearer ${token}` } });
      const countData = await countRes.json() as any;
      if (countData.success) setUnreadCount(countData.count);
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
    fetchPrivateMessages();
    fetchSquad();
    fetchParticipantsAndTransforms();
  }, [navigate]);

  // P36: キャラクター削除（確認のためキャラクター名の入力を要求）
  const handleDeleteCharacter = async () => {
    if (!user) return;
    const input = window.prompt(`本当に削除しますか？取り消せません。\n確認のためキャラクター名「${user.chara_name}」を入力してください`);
    if (input === null) return;
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/delete-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ confirm_name: input })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        localStorage.removeItem('gtactics_token');
        navigate('/');
      } else {
        setError(data.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError('削除処理に失敗しました');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('gtactics_token');
    navigate('/');
  };

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
    <div className="register-container" style={{ padding: '20px', minHeight: '100vh', display: 'flex', alignItems: 'flex-start' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%', margin: '0 auto' }}>
        
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: '5px' }}>{user.handle_name}【{user.rank || '-'}】用ステータス画面</h1>
              {unreadCount > 0 && (
                <div
                  style={{ background: '#e53e3e', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', animation: 'pulse 2s infinite' }}
                  onClick={() => navigate(`/profile/${user.id}`)}
                  title="クリックで自分のステ詳細を開き、伝言を確認します"
                >
                  伝言が {unreadCount} 件届いています！（クリックでステ詳細へ）
                </div>
              )}
            </div>
            {(user as any).faction_notice && (
              <div style={{ fontSize: '0.9rem', color: '#4bff7d' }}>
                【{(user as any).faction_name}より通達】{(user as any).faction_notice}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {user.is_admin === 1 && (
              <button onClick={() => navigate('/admin')} style={{ padding: '6px 12px', background: '#e53e3e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                ADMIN
              </button>
            )}
            <button onClick={() => navigate('/profile-edit')} className="text-btn" style={{ color: '#4facfe' }}>プロフィール変更</button>
            <button onClick={handleLogout} className="text-btn" style={{ color: '#ff4b4b' }}>LOGOUT</button>
            <button onClick={handleDeleteCharacter} className="text-btn" style={{ color: '#7f1d1d', marginLeft: '0.5rem' }} title="キャラクターを完全に削除します（取り消し不可）">キャラ削除</button>
          </div>
        </div>

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

        {/* MAIN LAYOUT - 2 COLUMNS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          
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
              
              <div style={{ display: 'flex', gap: '20px' }}>
                {/* Unit Image & Actions */}
                <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ width: '120px', height: '120px', background: 'rgba(0,0,0,0.5)', border: '1px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {user.unit_image ? (
                      <img src={`/images/units/${user.unit_image}`} alt={user.unit_name || 'Unit'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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

                {/* Unit Stats */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                    <span style={{ color: '#888' }}>ユニット</span>
                    <span style={{ color: '#4bff7d', fontWeight: 'bold' }}>{user.unit_name}</span>
                    <button onClick={() => setShowUnitDesc(true)} style={{ background: '#444', color: '#fff', border: 'none', padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>機体解説</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                    <span style={{ color: '#888' }}>武器</span>
                    <span>{user.weapon_name || 'なし'}</span>
                    <button onClick={() => handleOpenInventory('weapon_id')} style={{ background: '#444', color: '#fff', border: 'none', padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>武器搭載</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                    <span style={{ color: '#888' }}>装備1</span>
                    <span>{user.item1_name || 'なし'}</span>
                    <button onClick={() => handleOpenInventory('item1_id')} style={{ background: '#444', color: '#fff', border: 'none', padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>装備1搭載</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                    <span style={{ color: '#888' }}>装備2</span>
                    <span>{user.item2_name || 'なし'}</span>
                    <button onClick={() => handleOpenInventory('item2_id')} style={{ background: '#444', color: '#fff', border: 'none', padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>装備2搭載</button>
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
                  <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.3)', padding: '5px', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#888' }}>機体の適性</span>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <span style={{ color: '#888', fontSize: '0.9rem' }}>戦闘</span>
                    <span>{winBattles}勝{loseBattles}敗</span>
                  </div>
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <span style={{ color: '#888', fontSize: '0.9rem' }}>勝率</span>
                    <span>{winRate}%</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* BOTTOM SECTIONS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          
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

        {/* BOTTOM NAVIGATION GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '10px' }}>
          <button onClick={() => navigate('/training')} className="submit-btn" style={{ background: '#2b6cb0', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>フラナガン機関</button>
          <button onClick={() => navigate('/anaheim')} className="submit-btn" style={{ background: '#2b6cb0', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>アナハイム</button>
          <button onClick={() => navigate('/hangar')} className="submit-btn" style={{ background: '#2b6cb0', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>格納庫</button>
          <button onClick={() => navigate('/database')} className="submit-btn" style={{ background: '#4c51bf', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>機体データベース</button>
          <button onClick={() => navigate('/ranking')} className="submit-btn" style={{ background: '#2b6cb0', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>ランキング</button>
          <button onClick={() => navigate('/tournament')} className="submit-btn" style={{ background: '#c53030', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>トーナメント</button>
          <button onClick={() => navigate('/faction')} className="submit-btn" style={{ background: '#48bb78', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>勢力一覧</button>
          <button onClick={() => navigate('/tactics')} className="submit-btn" style={{ background: '#2b6cb0', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>戦術設定</button>
          <button onClick={() => navigate('/log')} className="submit-btn" style={{ background: '#2b6cb0', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>防衛履歴</button>
          <button onClick={() => navigate('/team')} className="submit-btn" style={{ background: '#2b6cb0', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>チーム編成</button>
          <button onClick={() => navigate('/chat')} className="submit-btn" style={{ background: '#d69e2e', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>チャット</button>
          <button onClick={() => navigate('/bbs')} className="submit-btn" style={{ background: '#dd6b20', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>掲示板</button>
          <button onClick={() => navigate('/trade')} className="submit-btn" style={{ background: '#b7791f', padding: '10px 5px', fontSize: '0.8rem', margin: 0 }}>中古MS売り場</button>
        </div>
      </div>

      {/* 機体解説モーダル */}
      {showUnitDesc && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowUnitDesc(false)}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <h3 className="cyber-title" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#4bc8ff' }}>{user.unit_name}</h3>
            {user.unit_image && (
              <img src={`/images/units/${user.unit_image}`} alt={user.unit_name} style={{ maxWidth: '160px', display: 'block', margin: '0 auto 1rem' }} />
            )}
            <div style={{ color: '#ddd', lineHeight: 1.8, fontSize: '0.95rem', fontStyle: 'italic' }}>
              {(user as any).unit_description || 'この機体の解説データはありません。'}
            </div>
            <button onClick={() => setShowUnitDesc(false)} className="text-btn" style={{ width: '100%', marginTop: '1.2rem', padding: '0.6rem', border: '1px solid #aaa', borderRadius: '4px' }}>閉じる</button>
          </div>
        </div>
      )}

      {/* Inventory Modal */}
      {showInventory && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 className="cyber-title" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#4bc8ff' }}>INVENTORY - アイテム選択</h3>
            
            <button 
              className="submit-btn" 
              onClick={() => handleEquip(null)}
              style={{ width: '100%', marginBottom: '1rem', background: 'rgba(255, 107, 107, 0.2)', color: '#ff6b6b', borderColor: '#ff6b6b' }}
            >
              現在の装備を外す
            </button>

            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.1)', textAlign: 'left' }}>
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
                    <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                      インベントリにアイテムがありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <button 
              onClick={() => setShowInventory(false)}
              className="text-btn"
              style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', background: 'transparent', border: '1px solid #aaa', color: '#aaa', borderRadius: '4px', cursor: 'pointer' }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

