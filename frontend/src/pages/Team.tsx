import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showConfirm } from '../components/confirm';
import './Team.css';
import { UnitImage } from '../components/UnitImage';

interface TeamMember {
  id: number;
  character_id: string;
  name: string;
  unit_name: string;
  unit_image: string;
  level: number;
  hp: number;
  en: number;
  team_tactic?: string;
  cost?: number;
  created_at: string;
}

// P38: チーム戦術（manual_tsenjyutu.htm）。対象×行動の2要素
const TACTIC_TARGETS: [string, string][] = [
  ['N', '特になし'], ['L', 'リーダー'], ['A', 'アタッカー'], ['D', 'ディフェンダー'], ['S', 'サポーター'],
];
const TACTIC_ACTIONS: [string, string][] = [
  ['N', '特になし'], ['A', '攻撃する'], ['D', '防禦する'], ['S', '掩護する'],
];

const TeamTacticSelector: React.FC<{ value: string, onChange: (t: string) => void }> = ({ value, onChange }) => {
  const v = (value || 'NN').toUpperCase();
  return (
    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.4rem' }}>
      <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>団体戦術:</span>
      <select value={v[0] || 'N'} onChange={e => onChange(e.target.value + (v[1] || 'N'))}
        style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px', padding: '2px 4px' }}>
        {TACTIC_TARGETS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>を</span>
      <select value={v[1] || 'N'} onChange={e => onChange((v[0] || 'N') + e.target.value)}
        style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px', padding: '2px 4px' }}>
        {TACTIC_ACTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
    </div>
  );
};

interface Candidate {
  id: string;
  handle_name: string;
  chara_name: string;
  level: number;
  unit_name: string;
  unit_image: string;
  cost?: number;
}

export const Team: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [squad, setSquad] = useState<TeamMember[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [myTactic, setMyTactic] = useState('NN');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sysMsg, setSysMsg] = useState('');

  const fetchMe = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return navigate('/');
    try {
      const response = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setUser(data.user);
        return data.user;
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('データの取得に失敗しました');
    }
  };

  const fetchSquad = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const response = await fetch('/api/squad', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setSquad(data.squad);
        if (data.my_team_tactic) setMyTactic(data.my_team_tactic);
      }
    } catch (err) {
      setError('チーム情報の取得に失敗しました');
    }
  };

  // P38: チーム戦術の保存（member_id='self' で自分）
  const handleTactic = async (memberId: number | 'self', tactic: string) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    if (memberId === 'self') setMyTactic(tactic);
    else setSquad(prev => prev.map(m => m.id === memberId ? { ...m, team_tactic: tactic } : m));
    try {
      const res = await fetch('/api/squad/tactic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ member_id: memberId, tactic })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        setTimeout(() => setSysMsg(''), 2000);
      } else {
        setError(data.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError('チーム戦術の保存に失敗しました');
    }
  };

  const fetchCandidates = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const response = await fetch('/api/squad/candidates', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setCandidates(data.candidates);
      }
    } catch (err) {
      setError('候補の取得に失敗しました');
    }
  };

  const loadData = async () => {
    setLoading(true);
    const u = await fetchMe();
    if (u) {
      await fetchSquad();
      if (u.faction_id) {
        await fetchCandidates();
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [navigate]);

  const showMsg = (msg: string) => {
    setSysMsg(msg);
    setTimeout(() => setSysMsg(''), 3000);
  };

  const handleRecruit = async (targetId: string) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const response = await fetch('/api/squad/recruit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ target_id: targetId })
      });
      const data = (await response.json()) as any;
      if (data.success) {
        showMsg(data.message);
        loadData();
      } else {
        setError(data.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    }
  };

  const handleRemove = async (id: number) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    if (!(await showConfirm('本当にこのメンバーをチームから外しますか？', { title: '除隊の確認', confirmLabel: '外す' }))) return;
    
    try {
      const response = await fetch(`/api/squad/remove/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        showMsg(data.message);
        loadData();
      } else {
        setError(data.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    }
  };

  if (loading) return <div className="register-container"><div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Loading...</div></div>;

  return (
    <div className="register-container">
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%' }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Team Formation</div>
          <h1 className="page-title">チーム編成</h1>
        </div>
        <button onClick={() => navigate('/mypage')} className="btn sm">マイページへ</button>
      </div>

      {error && <div className="msg err">{error}</div>}
      {sysMsg && <div className="msg ok">{sysMsg}</div>}

      {!user?.faction_id && (
        <div className="msg err">
          勢力に所属していないため、チームを編成できません。<br/>
          まずは勢力に参加するか、新しく勢力を立ち上げてください。
        </div>
      )}

      {user?.faction_id && (
        <>
          <div className="section-panel">
            <h2 className="sec-title">現在のチームメンバー ({squad.length}/4)</h2>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '6px', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 'bold' }}>あなた（リーダー）</div>
              <TeamTacticSelector value={myTactic} onChange={t => handleTactic('self', t)} />
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.4rem', lineHeight: 1.5 }}>
                行動で役割が決まります: 攻撃する=アタッカー（攻+回避-）／防禦する=ディフェンダー（対象への攻撃を阻む）／掩護する=サポーター（対象を掩護・戦闘中の援護）。<br/>
                「特になし を 攻撃する」は無作為攻撃（阻まれなければ敵サポーターの掩護補正を受けない）。
              </div>
            </div>

            {/* 総コスト240制限（manual_team.htm: 最大人数4・総コスト240まで） */}
            {(() => {
              const totalCost = (user?.cost || 0) + squad.reduce((a, w) => a + (w.cost || 0), 0);
              const remaining = 240 - totalCost;
              return (
                <div style={{ margin: '0.5rem 0 1rem', padding: '0.6rem 1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                  <span>総コスト: <b style={{ color: '#ecc94b' }}>{totalCost}</b> / 240（自機コスト{user?.cost || 0}含む）</span>
                  <span>残コスト: <b style={{ color: remaining < 0 ? '#f56565' : '#4bff7d' }}>{remaining}</b></span>
                </div>
              );
            })()}
            {squad.length === 0 ? (
              <p className="empty-text">現在チームメンバーはいません。</p>
            ) : (
              <div className="grid-container">
                {squad.map(w => (
                  <div key={w.id} className="member-card">
                    <div className="card-content">
                      {w.unit_image && (
                        <div className="unit-image-wrapper">
                          <UnitImage file={w.unit_image} alt={w.unit_name} className="unit-image" />
                        </div>
                      )}
                      <div className="char-info">
                        <div className="char-name">{w.name} <span className="char-level">Lv: {w.level}</span></div>
                        <div className="unit-name">機体: {w.unit_name}</div>
                        <div className="char-stats">HP: {w.hp} / EN: {w.en}</div>
                        <div className="char-stats">コスト: {w.cost || '?'}</div>
                        <div className="char-date">編成日時: {new Date(w.created_at).toLocaleString()}</div>
                      </div>
                    </div>

                    <TeamTacticSelector value={w.team_tactic || 'NN'} onChange={t => handleTactic(w.id, t)} />

                    <div style={{ marginTop: '0.5rem' }}>
                      <button
                        onClick={() => handleRemove(w.id)}
                        className="btn sm danger"
                      >
                        チームから外す
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="section-desc" style={{ marginTop: '1.5rem' }}>
              ※ 編成した時点のステータス（スナップショット）が保存されます。編成後に相手が装備を変更しても、チームメンバーとしての強さは変化しません。
            </p>
          </div>

          <div className="section-panel">
            <h2 className="sec-title">編成可能な勢力メンバー</h2>
            <p className="section-desc">同じ勢力に所属しているプレイヤーをチームに勧誘できます。</p>
            
            {candidates.length === 0 ? (
              <p className="empty-text">編成可能なメンバーがいません。</p>
            ) : (
              <div className="grid-container">
                {candidates.map(c => {
                  const isRecruited = squad.some(s => s.character_id === c.id);
                  const isFull = squad.length >= 4;
                  // 総コスト240制限: 加えると超過する候補は【ＮＡ】（manual_team.htm）
                  const remaining = 240 - ((user?.cost || 0) + squad.reduce((a, w) => a + (w.cost || 0), 0));
                  const isOverCost = (c.cost || 0) > remaining;
                  return (
                    <div key={c.id} className="candidate-card">
                      <div className="card-content">
                        <div className="unit-image-wrapper">
                          <UnitImage file={c.unit_image} alt={c.unit_name} className="unit-image" />
                        </div>
                        <div className="char-info">
                          <div className="char-name">
                            {c.chara_name || c.handle_name}
                            <span className="char-level">Lv.{c.level}</span>
                          </div>
                          <div className="unit-name">{c.unit_name || '不明'}</div>
                          <div className="char-stats" style={{ fontSize: '0.8rem' }}>
                            コスト: {c.cost ?? '?'}
                            <b style={{ marginLeft: '0.5rem', color: isOverCost ? '#f56565' : '#4bff7d' }}>
                              {isOverCost ? '【ＮＡ】' : '【ＯＫ】'}
                            </b>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRecruit(c.id)}
                        disabled={isRecruited || isFull || isOverCost}
                        className="btn sm primary"
                      >
                        {isRecruited ? '編成済み' : isOverCost ? 'コスト超過' : 'チームに加える'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
};


