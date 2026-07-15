import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BattleAnimation, type BattleEvent, type BattleMeta } from '../components/BattleAnimation';
import { UnitImage } from '../components/UnitImage';

const TerrainMap: Record<number, string> = { 1: '地上', 2: '水中', 3: '宇宙', 4: '空中', 5: '仮想空間' };

interface Champion {
  id: number;
  type: string;
  champion_id: string;
  win_count: number;
  terrain: number;
  chara_name: string;
  level: number;
  unit_name: string | null;
  unit_image: string | null;
  def_hp?: number;
  def_en?: number;
  snapshot_data?: string;
  logs?: any[];
}

const Battle: React.FC = () => {
  const navigate = useNavigate();
  const [indChampion, setIndChampion] = useState<Champion | null>(null);
  const [teamChampion, setTeamChampion] = useState<Champion | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [messageModal, setMessageModal] = useState<{isOpen: boolean, text: string}>({isOpen: false, text: ''});
  const [createDefenseModal, setCreateDefenseModal] = useState<{isOpen: boolean}>({isOpen: false});
  const [moveTerrainModal, setMoveTerrainModal] = useState<{isOpen: boolean, type: string}>({isOpen: false, type: ''});
  const [defenseTitle, setDefenseTitle] = useState('');
  const [defenseTerrain, setDefenseTerrain] = useState(1);
  const [defenseIsTeam, setDefenseIsTeam] = useState(false);
  const [defenseHpCond, setDefenseHpCond] = useState<'free' | 'min' | 'max'>('free');
  const [defenseHpValue, setDefenseHpValue] = useState('');
  const [defenseRankCond, setDefenseRankCond] = useState<'free' | 'min' | 'max'>('free');
  const [defenseRankValue, setDefenseRankValue] = useState('1');
  const [defenseReqUnitType, setDefenseReqUnitType] = useState('');
  const [defenses, setDefenses] = useState<any[]>([]);
  const [defensePage, setDefensePage] = useState(1);
  const [defenseTotal, setDefenseTotal] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [battleData, setBattleData] = useState<{events: BattleEvent[], meta: BattleMeta} | null>(null);
  const [showLogsModal, setShowLogsModal] = useState<{isOpen: boolean, title: string, logs: any[]}>({isOpen: false, title: '', logs: []});

  const showMessage = (text: string) => {
    setMessageModal({ isOpen: true, text });
  };

  const fetchChampions = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/champion', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json() as any;
      if (res.ok && data) {
        setIndChampion(data.individual || null);
        setTeamChampion(data.team || null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDefenses = async (page: number) => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch(`/api/defense?page=${page}`, { headers: { Authorization: `Bearer ${token}` }});
      const data = await res.json() as any;
      if (data.battles) {
        setDefenses(data.battles);
        setDefenseTotal(data.total);
        setDefensePage(data.page);
      }
    } catch(e) {}
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('gtactics_token');
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` }});
        const data = await res.json() as any;
        if (data.success) setUserId(data.user.id);
      } catch (e) {}
    };

    const load = async () => {
      setLoading(true);
      await Promise.all([fetchProfile(), fetchChampions(), fetchDefenses(1)]);
      setLoading(false);
    };
    load();
  }, []);

  const handleChallengeDefense = async (id: number) => {
    setIsSubmitting(true);
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch(`/api/defense/challenge/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json() as any;
      if (!res.ok) {
        showMessage(data.error || 'エラーが発生しました');
      } else {
        if (data.events && data.meta) {
          setBattleData({ events: data.events, meta: data.meta });
        } else {
          showMessage(data.message);
        }
        fetchDefenses(defensePage);
      }
    } catch (e) {
      showMessage('通信エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdrawDefense = async (id: number) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch(`/api/defense/withdraw/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json() as any;
      if (!res.ok) {
        showMessage(data.error || 'エラーが発生しました');
      } else {
        showMessage(data.message);
        fetchDefenses(defensePage);
      }
    } catch (e) {
      showMessage('通信エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Q2 観戦: 他人の作戦の直近戦闘を見る（原作 ps_btlview dsp_btl → battleview 相当）
  const handleSpectateDefense = async (id: number, title: string) => {
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch(`/api/defense/${id}/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success) {
        showMessage(data.error || '戦闘記録の取得に失敗しました');
        return;
      }
      setShowLogsModal({ isOpen: true, title: `${title} の戦闘記録`, logs: data.logs || [] });
    } catch (e) {
      showMessage('通信エラーが発生しました。');
    }
  };

  const handleChallengeChampion = async (type: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch(`/api/champion/challenge/${type}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json() as any;
      if (!res.ok) {
        showMessage(data.error || 'エラーが発生しました');
      } else {
        if (data.events && data.meta) {
          setBattleData({ events: data.events, meta: data.meta });
        } else {
          showMessage(data.message || '挑戦しました！');
        }
        fetchChampions();
      }
    } catch (err) {
      showMessage('通信エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDefenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!defenseTitle.trim() || isSubmitting) return;

    // 原作 trmt_jyoken 形式: 正=以上・負=以下・0=自由
    const hpVal = parseInt(defenseHpValue || '0', 10) || 0;
    const reqMaxHp = defenseHpCond === 'free' ? 0 : (defenseHpCond === 'min' ? hpVal : -hpVal);
    const rankVal = parseInt(defenseRankValue || '0', 10) || 0;
    const reqRank = defenseRankCond === 'free' ? 0 : (defenseRankCond === 'min' ? rankVal : -rankVal);

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/defense/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: defenseTitle,
          isTeam: defenseIsTeam,
          terrain: defenseTerrain,
          reqMaxHp,
          reqRank,
          reqUnitType: defenseReqUnitType
        })
      });
      const data = await res.json() as any;

      if (!res.ok) {
        showMessage(data.error);
      } else {
        setCreateDefenseModal({ isOpen: false });
        setDefenseTitle('');
        showMessage('作戦を発動しました！');
        fetchDefenses(1);
      }
    } catch (err) {
      showMessage('通信エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMoveTerrain = async (terrainId: number) => {
    if (!moveTerrainModal.type) return;
    const type = moveTerrainModal.type;
    
    if (isSubmitting) return;
    setIsSubmitting(true);
    setMoveTerrainModal({isOpen: false, type: ''});
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch(`/api/champion/move-terrain/${type}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ targetTerrain: terrainId })
      });
      const data = await res.json() as any;
      if (!res.ok) {
        showMessage(data.error || 'エラーが発生しました');
      } else {
        showMessage('戦場を移動しました！');
        fetchChampions();
      }
    } catch (err) {
      showMessage('通信エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="register-container"><div style={{color: 'var(--accent-color)'}}>LOADING BATTLES...</div></div>;

  const renderChampionCard = (champ: Champion | null, title: string, type: string) => {
    return (
      <div className="stats-allocation" style={{ marginTop: '0', marginBottom: '2rem' }}>
        <h3 style={{ margin: 0, paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
          {title}
        </h3>
        
        {!champ ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>現在優勝者はいません。</p>
            <button className="submit-btn" onClick={() => handleChallengeChampion(type)} disabled={isSubmitting}>
              優勝者に挑戦 (不戦勝)
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: '2rem' }}>
            <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#050510' }}>
               <div style={{ position: 'relative', zIndex: 1, padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {champ.unit_image && (
                    <UnitImage file={champ.unit_image} alt="unit" style={{ width: '150px', objectFit: 'contain' }} />
                  )}
                  <div>
                    <div style={{ color: 'var(--accent-color)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>CURRENT CHAMPION</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{champ.chara_name}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>搭乗機: {champ.unit_name || '無人機'}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>Lv.{champ.level}</div>
                    {champ.def_hp != null && champ.snapshot_data && (
                      <div style={{ color: 'var(--accent-color)', marginTop: '0.2rem', fontSize: '0.9rem' }}>
                        耐久: {champ.def_hp} / { (() => {
                          try {
                            const snap = JSON.parse(champ.snapshot_data);
                            return Array.isArray(snap) ? snap[0].maxHp : snap.maxHp;
                          } catch(e) { return '?'; }
                        })() }
                      </div>
                    )}
                  </div>
               </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'rgba(0,255,204,0.05)', border: '1px solid var(--accent-color)', padding: '1rem', textAlign: 'center', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', marginBottom: '0.5rem' }}>連勝記録</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>{champ.win_count} 連勝中</div>
              </div>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  戦場: {TerrainMap[champ.terrain] || '不明'}
                </div>
                <button className="submit-btn" onClick={() => handleChallengeChampion(type)} disabled={isSubmitting} style={{ width: '100%', margin: 0 }}>
                  優勝者に挑戦
                </button>
                {champ.champion_id === userId && (
                  <button className="text-btn" onClick={() => setMoveTerrainModal({isOpen: true, type})} style={{ width: '100%', fontSize: '0.8rem' }}>
                    戦場変更 (名声5消費)
                  </button>
                )}
                <button className="text-btn" onClick={() => setShowLogsModal({isOpen: true, title: title, logs: champ.logs || []})} style={{ width: '100%', fontSize: '0.8rem' }}>
                  挑戦履歴(直近5件)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '900px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>COMBAT MENU</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn">BACK</button>
        </div>
        
        {renderChampionCard(indChampion, '【 個人優勝戦 】', 'individual')}
        {renderChampionCard(teamChampion, '【 チーム優勝戦 】', 'team')}

        <div className="stats-allocation" style={{ marginTop: '2rem' }}>
          <h3 style={{ margin: 0, marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>個別戦闘（作戦）一覧</h3>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {defenses.map(d => (
              <div key={d.id} style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--accent-color)' }}>{d.title}</h4>
                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '0.3rem' }}>
                      防衛者: {d.champion_name} (設置者: {d.owner_name}) / 形式: {d.is_team ? 'チーム戦' : '個人戦'} / 地形: {TerrainMap[d.terrain]}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#fbbf24', marginTop: '0.3rem' }}>連勝数: {d.win_count}</div>
                    {d.def_hp != null && d.snapshot_data && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', marginTop: '0.2rem' }}>
                        防衛耐久: {d.def_hp} / {(() => {
                          try {
                            const snap = JSON.parse(d.snapshot_data);
                            return Array.isArray(snap) ? snap[0].maxHp : snap.maxHp;
                          } catch (e) { return '?'; }
                        })()}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="text-btn" onClick={() => handleSpectateDefense(d.id, d.title)} style={{ margin: 0 }}>観戦</button>
                    <button className="submit-btn" onClick={() => handleChallengeDefense(d.id)} disabled={isSubmitting} style={{ margin: 0 }}>挑戦する</button>
                    {d.champion_id === userId && (
                      <button className="submit-btn" onClick={() => handleWithdrawDefense(d.id)} disabled={isSubmitting} style={{ margin: 0, background: 'rgba(255, 75, 75, 0.2)', border: '1px solid #ff4b4b', color: '#ff4b4b' }}>
                        作戦終了
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
            <button className="text-btn" disabled={defensePage <= 1} onClick={() => fetchDefenses(defensePage - 1)}>前へ</button>
            <span style={{ color: '#fff', alignSelf: 'center' }}>{defensePage} / {Math.ceil(defenseTotal / 10) || 1}</span>
            <button className="text-btn" disabled={defensePage >= Math.ceil(defenseTotal / 10)} onClick={() => fetchDefenses(defensePage + 1)}>次へ</button>
          </div>
        </div>

        <div className="stats-allocation" style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>防衛データ作成 (名声10消費)</h3>
            <button className="submit-btn" onClick={() => setCreateDefenseModal({ isOpen: true })} style={{ margin: 0, padding: '0.5rem 1rem' }}>
              作成する
            </button>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            現在のステータスと搭乗機体で防衛データを作成し、挑戦者を待ち受けます。<br/>
            勝利するたびに報酬と名声が蓄積されます。
          </p>
        </div>
      </div>

      {battleData && (
        <BattleAnimation 
          events={battleData.events}
          meta={battleData.meta}
          onClose={() => setBattleData(null)}
        />
      )}

      {messageModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '400px', textAlign: 'center' }}>
            <h3 style={{ color: 'var(--accent-color)', marginBottom: '1rem' }}>SYSTEM MESSAGE</h3>
            <p style={{ marginBottom: '2rem' }}>{messageModal.text}</p>
            <button className="submit-btn" onClick={() => setMessageModal({ isOpen: false, text: '' })} style={{ width: '100%', margin: 0 }}>
              OK
            </button>
          </div>
        </div>
      )}

      {moveTerrainModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}>
            <h3 className="cyber-title" style={{ fontSize: '1.2rem', marginBottom: '1rem', textAlign: 'center' }}>移動先の戦場を選択</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button className="submit-btn" onClick={() => handleMoveTerrain(1)} disabled={isSubmitting} style={{ margin: 0 }}>地上</button>
              <button className="submit-btn" onClick={() => handleMoveTerrain(2)} disabled={isSubmitting} style={{ margin: 0 }}>水中</button>
              <button className="submit-btn" onClick={() => handleMoveTerrain(3)} disabled={isSubmitting} style={{ margin: 0 }}>宇宙</button>
              <button className="submit-btn" onClick={() => handleMoveTerrain(4)} disabled={isSubmitting} style={{ margin: 0 }}>空中</button>
              <button className="submit-btn" onClick={() => handleMoveTerrain(5)} disabled={isSubmitting} style={{ margin: 0 }}>仮想空間（地形補正なし）</button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button className="text-btn" onClick={() => setMoveTerrainModal({isOpen: false, type: ''})} disabled={isSubmitting}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {showLogsModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ color: 'var(--accent-color)', marginBottom: '1rem' }}>{showLogsModal.title} - 挑戦履歴(直近5件)</h3>
            {showLogsModal.logs.length === 0 ? (
              <p>記録はありません。</p>
            ) : (
              showLogsModal.logs.map((log: any, idx: number) => (
                <div key={idx} style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '0.5rem' }}>{new Date(log.created_at).toLocaleString('ja-JP')}</div>
                  <div style={{ fontWeight: 'bold', color: log.is_attacker_win ? '#ff4b4b' : '#4facfe', marginBottom: '0.5rem' }}>
                    {log.is_attacker_win ? '防衛失敗（敗北して王座陥落）' : '防衛成功（勝利）'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#ddd', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px' }}>
                    {log.log_text}
                  </div>
                  {log.events && log.meta && (
                    <button 
                      className="submit-btn" 
                      onClick={() => {
                        setShowLogsModal({ isOpen: false, title: '', logs: [] });
                        setBattleData({ events: log.events, meta: log.meta });
                      }}
                      style={{ marginTop: '0.5rem', width: '100%', background: 'rgba(0, 255, 204, 0.2)', border: '1px solid var(--accent-color)' }}
                    >
                      アニメーションでリプレイを見る
                    </button>
                  )}
                </div>
              ))
            )}
            <button className="submit-btn" onClick={() => setShowLogsModal({ isOpen: false, title: '', logs: [] })} style={{ width: '100%', margin: '1rem 0 0 0' }}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {createDefenseModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '400px' }}>
            <h3 style={{ color: 'var(--accent-color)', marginBottom: '1rem', textAlign: 'center' }}>個別戦闘の発動</h3>
            <form onSubmit={handleCreateDefenseSubmit}>
              <div className="form-group">
                <label>作戦名</label>
                <input
                  type="text"
                  className="cyber-input"
                  value={defenseTitle}
                  onChange={(e) => setDefenseTitle(e.target.value)}
                  placeholder="防衛線の名前を入力"
                  maxLength={30}
                  required
                />
              </div>
              <div className="form-group">
                <label>戦場</label>
                <select className="cyber-input" value={defenseTerrain} onChange={(e) => setDefenseTerrain(Number(e.target.value))}>
                  <option value={1}>地上</option>
                  <option value={2}>水中</option>
                  <option value={3}>宇宙</option>
                  <option value={4}>空中</option>
                </select>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={defenseIsTeam} onChange={(e) => setDefenseIsTeam(e.target.checked)} />
                  チーム戦発動（要チームメンバー編成）
                </label>
              </div>
              <div className="form-group">
                <label>機体指定（機体ID。空欄=自由）</label>
                <input type="text" className="cyber-input" value={defenseReqUnitType} onChange={(e) => setDefenseReqUnitType(e.target.value)} placeholder="unit_id を指定（機体DBのFINo）" />
              </div>
              <div className="form-group">
                <label>階級(ランク)制限</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select className="cyber-input" value={defenseRankCond} onChange={(e) => setDefenseRankCond(e.target.value as any)} style={{ flex: 1 }}>
                    <option value="free">【自由】</option>
                    <option value="min">【以上】</option>
                    <option value="max">【以下】</option>
                  </select>
                  <select className="cyber-input" value={defenseRankValue} onChange={(e) => setDefenseRankValue(e.target.value)} disabled={defenseRankCond === 'free'} style={{ flex: 1 }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(r => <option key={r} value={r}>ランク{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>耐久制限</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select className="cyber-input" value={defenseHpCond} onChange={(e) => setDefenseHpCond(e.target.value as any)} style={{ flex: 1 }}>
                    <option value="free">【自由】</option>
                    <option value="min">【以上】</option>
                    <option value="max">【以下】</option>
                  </select>
                  <input type="number" className="cyber-input" value={defenseHpValue} onChange={(e) => setDefenseHpValue(e.target.value)} disabled={defenseHpCond === 'free'} placeholder="耐久値" style={{ flex: 1 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="submit" className="submit-btn" disabled={isSubmitting} style={{ flex: 1, margin: 0 }}>
                  発動する
                </button>
                <button type="button" className="submit-btn" onClick={() => { setCreateDefenseModal({ isOpen: false }); setDefenseTitle(''); }} style={{ flex: 1, margin: 0, background: 'transparent', border: '1px solid #aaa', color: '#aaa' }}>
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Battle;

