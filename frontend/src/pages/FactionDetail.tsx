import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './Register.css';

interface FactionData {
  id: number;
  name: string;
  leader_name: string;
  leader_id: string;
  color: string;
  description: string;
  funds: number;
  max_members: number;
  notice: string;
  hp_url: string;
  influence: number;
  created_at: string;
}

interface MemberData {
  id: string;
  handle_name: string;
  chara_name: string;
  level: number;
  faction_role: string;
  faction_katagaki: string;
  faction_message: string;
  unit_name: string;
}

export const FactionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [faction, setFaction] = useState<FactionData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [user, setUser] = useState<any>(null);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [donateAmount, setDonateAmount] = useState<number>(0);
  const [joinMessage, setJoinMessage] = useState<string>('');
  const [contactMessage, setContactMessage] = useState<string>('');

  // 編集用ステート
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editMaxMembers, setEditMaxMembers] = useState(30);
  const [editNotice, setEditNotice] = useState('');
  const [editHpUrl, setEditHpUrl] = useState('');

  // 呼称変更用
  const [katagakiInputs, setKatagakiInputs] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    fetchFactionDetail();
    fetchMe();
  }, [id]);

  const fetchMe = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const response = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setUser(data.user);
        if (data.user.faction_id === Number(id)) {
          setContactMessage(data.user.faction_message || '');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFactionDetail = async () => {
    try {
      const response = await fetch(`/api/factions/${id}`);
      const data = (await response.json()) as any;
      if (data.success) {
        setFaction(data.faction);
        setMembers(data.members);

        setEditName(data.faction.name);
        setEditDesc(data.faction.description);
        setEditColor(data.faction.color);
        setEditMaxMembers(data.faction.max_members || 30);
        setEditNotice(data.faction.notice || '');
        setEditHpUrl(data.faction.hp_url || '');

        const kInputs: { [key: string]: string } = {};
        data.members.forEach((m: MemberData) => {
          kInputs[m.id] = m.faction_katagaki || '';
        });
        setKatagakiInputs(kInputs);

      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('勢力詳細の取得に失敗しました');
    }
  };

  const apiPost = async (path: string, body?: any) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/factions/${id}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage(data.message);
        if (path === '/leave') {
          navigate('/faction');
        } else {
          fetchFactionDetail();
          fetchMe();
        }
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('操作に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const apiPut = async (path: string, body: any) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/factions/${id}${path}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage(data.message);
        fetchFactionDetail();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('操作に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDonate = () => {
    if (donateAmount > 0) {
      apiPost('/donate', { amount: donateAmount });
      setDonateAmount(0);
    }
  };

  const handleUpdateFaction = () => {
    apiPut('', {
      name: editName,
      description: editDesc,
      color: editColor,
      max_members: editMaxMembers,
      notice: editNotice,
      hp_url: editHpUrl
    });
  };


  if (!faction && !error) return <div className="register-container"><div style={{ color: '#00f2fe' }}>LOADING...</div></div>;

  const isMember = user?.faction_id === Number(id) && user?.faction_role !== 'applicant';
  const isApplicant = user?.faction_id === Number(id) && user?.faction_role === 'applicant';
  const isLeader = user?.id === faction?.leader_id;

  const currentMembersCount = members.filter(m => m.faction_role !== 'applicant').length;

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {faction && <div style={{ width: '20px', height: '20px', background: faction.color, borderRadius: '50%', border: '2px solid #fff' }}></div>}
            <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>
              {faction?.name} 司令室
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate('/faction')} className="text-btn">BACK</button>
          </div>
        </div>

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}
        {message && <div className="success-message" style={{ marginBottom: '1rem', color: '#4bc8ff' }}>{message}</div>}

        {/* メンバーへの通知エリア */}
        {isMember && faction?.notice && (
          <div style={{ background: 'rgba(255, 100, 100, 0.1)', border: '1px solid #ff4b4b', padding: '1rem', borderRadius: '4px', marginBottom: '1.5rem' }}>
            <div style={{ color: '#ff4b4b', fontWeight: 'bold', marginBottom: '0.5rem' }}>[リーダーからの通知]</div>
            <div style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>{faction.notice}</div>
          </div>
        )}

        {faction && (
          <div style={{ marginBottom: '2rem', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '8px', borderLeft: `4px solid ${faction.color}` }}>
            <div style={{ color: '#aaa', marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>{faction.description}</div>
            <div style={{ display: 'flex', gap: '2rem', color: '#fff', flexWrap: 'wrap' }}>
              <div><span style={{ color: '#888' }}>リーダー:</span> <span style={{ color: '#ecc94b' }}>{faction.leader_name}</span></div>
              <div><span style={{ color: '#888' }}>勢力資金:</span> <span style={{ color: '#4bff7d' }}>{faction.funds} G</span></div>
              <div><span style={{ color: '#888' }}>所属人数:</span> {currentMembersCount} / {faction.max_members || 30} 名</div>
              <div><span style={{ color: '#888' }}>影響力(Rank Pts):</span> <span style={{ color: '#ff4b4b' }}>{faction.influence || 0}</span></div>
              {faction.hp_url && (
                <div><a href={faction.hp_url} target="_blank" rel="noreferrer" style={{ color: '#4facfe' }}>HPアドレスリンク</a></div>
              )}
            </div>
            {isMember && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button className="submit-btn" onClick={() => navigate('/faction-unit')} style={{ background: 'linear-gradient(45deg, #4facfe, #00f2fe)', border: 'none' }}>
                  勢力機体（ルナツー）管理
                </button>
              </div>
            )}
          </div>
        )}

        {/* リーダー専用設定更新パネル */}
        {isLeader && (
          <div className="stats-allocation" style={{ marginTop: 0, marginBottom: '2rem', border: '1px solid #ecc94b' }}>
            <h3 style={{ color: '#ecc94b', borderBottom: '1px solid rgba(236, 201, 75, 0.3)' }}>FACTION SETTINGS (リーダー権限)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ color: '#aaa', fontSize: '0.8rem' }}>勢力名</label>
                <input type="text" className="login-input" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <label style={{ color: '#aaa', fontSize: '0.8rem' }}>カラーコード (16進)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ width: '40px', height: '40px', padding: 0, border: 'none', background: 'transparent' }} />
                  <input type="text" className="login-input" value={editColor} onChange={e => setEditColor(e.target.value)} />
                </div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ color: '#aaa', fontSize: '0.8rem' }}>アピール等 (紹介)</label>
                <textarea className="login-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}></textarea>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ color: '#aaa', fontSize: '0.8rem' }}>メンバーへの通知</label>
                <textarea className="login-input" value={editNotice} onChange={e => setEditNotice(e.target.value)} rows={2}></textarea>
              </div>
              <div>
                <label style={{ color: '#aaa', fontSize: '0.8rem' }}>HPアドレス</label>
                <input type="text" className="login-input" value={editHpUrl} onChange={e => setEditHpUrl(e.target.value)} />
              </div>
              <div>
                <label style={{ color: '#aaa', fontSize: '0.8rem' }}>最大人数</label>
                <input type="number" className="login-input" value={editMaxMembers} onChange={e => setEditMaxMembers(Number(e.target.value))} min="1" max="100" />
              </div>
            </div>
            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button onClick={handleUpdateFaction} disabled={loading} className="submit-btn" style={{ padding: '8px 20px' }}>設定を更新する</button>
            </div>
          </div>
        )}

        {/* メンバー/申請者/未所属用のアクションパネル */}
        {!isLeader && user && user.faction_id === 0 && (
          <div className="stats-allocation" style={{ marginTop: 0, marginBottom: '2rem' }}>
            <h3 style={{ color: '#4facfe' }}>所属申請</h3>
            <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>リーダーへ所属希望のコメントを送ることができます。</div>
            <input
              type="text"
              className="login-input"
              value={joinMessage}
              onChange={e => setJoinMessage(e.target.value)}
              placeholder="よろしくお願いします！等"
            />
            <button onClick={() => apiPost('/join', { message: joinMessage })} disabled={loading || currentMembersCount >= (faction?.max_members || 30)} className="submit-btn" style={{ background: '#2b6cb0' }}>申請を送信する</button>
          </div>
        )}

        {isApplicant && (
          <div className="stats-allocation" style={{ marginTop: 0, marginBottom: '2rem', border: '1px solid #4facfe' }}>
            <h3 style={{ color: '#4facfe' }}>申請中</h3>
            <div style={{ color: '#fff', marginBottom: '1rem' }}>現在、この勢力に所属申請中です。リーダーの承認をお待ちください。</div>
            <button onClick={() => apiPost('/leave')} disabled={loading} className="submit-btn" style={{ background: '#e53e3e' }}>申請を取り消す</button>
          </div>
        )}

        {isMember && (
          <div className="stats-allocation" style={{ marginTop: 0, marginBottom: '2rem', border: '1px solid rgba(75, 255, 125, 0.3)' }}>
            <h3 style={{ color: '#4bff7d', borderBottom: '1px solid rgba(75, 255, 125, 0.3)' }}>MEMBER ACTIONS</h3>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              {/* 連絡用コメント */}
              <div style={{ flex: 1, minWidth: '300px' }}>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>リーダーへの連絡用コメント</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    className="login-input"
                    style={{ margin: 0 }}
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    placeholder="連絡コメント"
                  />
                  <button onClick={() => apiPost('/message', { message: contactMessage })} disabled={loading} className="submit-btn" style={{ margin: 0, padding: '10px 20px', background: '#2b6cb0' }}>更新</button>
                </div>
              </div>

              {/* 寄付パネル */}
              <div style={{ flex: 1, minWidth: '300px' }}>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>共有資金に寄付する (所持金: {user?.money}G)</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="number"
                    className="login-input"
                    style={{ margin: 0 }}
                    value={donateAmount}
                    onChange={e => setDonateAmount(Number(e.target.value))}
                    placeholder="寄付額"
                    min="1"
                  />
                  <button onClick={handleDonate} disabled={loading || donateAmount <= 0} className="submit-btn" style={{ margin: 0, padding: '10px 20px', background: '#2b6cb0' }}>寄付</button>
                </div>
              </div>

              {/* 脱退パネル */}
              <div style={{ flex: 1, minWidth: '300px' }}>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>勢力から離脱する</div>
                <button
                  onClick={() => apiPost('/leave')}
                  disabled={loading}
                  className="submit-btn"
                  style={{ margin: 0, padding: '10px 20px', background: '#e53e3e' }}
                >
                  勢力を脱退する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* メンバーリスト */}
        <div className="stats-allocation" style={{ marginTop: 0 }}>
          <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>MEMBER ROSTER</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {members.map((m) => (
              <div key={m.id} style={{
                background: 'rgba(255,255,255,0.05)',
                padding: '1rem',
                borderRadius: '8px',
                borderTop: m.faction_role === 'leader' ? '3px solid #ecc94b' : m.faction_role === 'applicant' ? '3px solid #e53e3e' : '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 'bold', color: m.faction_role === 'leader' ? '#ecc94b' : m.faction_role === 'applicant' ? '#e53e3e' : '#fff' }}>
                    {m.faction_katagaki && <span style={{ color: '#aaa', marginRight: '5px', fontSize: '0.9rem' }}>{m.faction_katagaki}</span>}
                    {m.handle_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '4px' }}>
                    Lv.{m.level}
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{m.chara_name} / {m.unit_name || '無人機'}</div>

                {m.faction_message && (
                  <div style={{ fontSize: '0.85rem', color: '#4bff7d', background: 'rgba(0,0,0,0.3)', padding: '5px', marginTop: '0.5rem', borderRadius: '4px' }}>
                    {m.faction_message}
                  </div>
                )}

                {/* リーダー用管理ボタン */}
                {isLeader && m.id !== user?.id && (
                  <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                    {m.faction_role === 'applicant' ? (
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => apiPost(`/approve/${m.id}`)} disabled={loading} className="submit-btn" style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem', background: '#2b6cb0' }}>承認</button>
                        <button onClick={() => apiPost(`/reject/${m.id}`)} disabled={loading} className="submit-btn" style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem', background: '#e53e3e' }}>却下</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <button onClick={() => apiPost(`/delegate/${m.id}`)} disabled={loading} className="submit-btn" style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem', background: '#d69e2e', color: '#000' }}>移譲</button>
                        <button onClick={() => apiPost(`/kick/${m.id}`)} disabled={loading} className="submit-btn" style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem', background: '#e53e3e' }}>除隊</button>

                        <div style={{ display: 'flex', width: '100%', marginTop: '5px' }}>
                          <input
                            type="text"
                            value={katagakiInputs[m.id] || ''}
                            onChange={(e) => setKatagakiInputs({ ...katagakiInputs, [m.id]: e.target.value })}
                            style={{ flex: 1, padding: '4px', background: 'rgba(0,0,0,0.5)', border: '1px solid #444', color: '#fff', fontSize: '0.8rem' }}
                            placeholder="呼称"
                          />
                          <button onClick={() => apiPost(`/katagaki/${m.id}`, { katagaki: katagakiInputs[m.id] })} disabled={loading} className="submit-btn" style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem', background: '#4a5568', borderRadius: 0 }}>変更</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
