import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css';

interface FactionData {
  id: number;
  name: string;
  leader_name: string;
  color: string;
  description: string;
  funds: number;
  member_count: number;
}

export const Faction: React.FC = () => {
  const navigate = useNavigate();
  const [factions, setFactions] = useState<FactionData[]>([]);
  const [userFactionId, setUserFactionId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 設立用ステート
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#ffffff');

  useEffect(() => {
    fetchFactions();
    fetchMe();
  }, []);

  const fetchMe = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const response = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success && data.user.faction_id) {
        setUserFactionId(data.user.faction_id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFactions = async () => {
    try {
      const response = await fetch('/api/factions');
      const data = (await response.json()) as any;
      if (data.success) {
        setFactions(data.factions);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('勢力データの取得に失敗しました');
    }
  };

  const handleCreate = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return navigate('/');
    
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/factions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newName, description: newDesc, color: newColor })
      });
      const data = (await response.json()) as any;
      
      if (data.success) {
        setMessage(data.message);
        setIsCreating(false);
        fetchFactions();
        fetchMe();
        // 設立に成功したらその詳細画面へ
        navigate(`/faction/${data.faction_id}`);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('勢力の設立に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (factionId: number) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return navigate('/');

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`/api/factions/${factionId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = (await response.json()) as any;
      
      if (data.success) {
        setMessage(data.message);
        fetchFactions();
        fetchMe();
        navigate(`/faction/${factionId}`);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('加入申請に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '900px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>FACTION (勢力一覧)</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn">RETURN</button>
        </div>

        <p style={{ color: '#aaa', marginBottom: '2rem' }}>
          プレイヤー同士で結成される勢力のリストです。<br/>
          どこかの勢力に所属して資金を共有したり、独自の大規模作戦に参加しましょう。
        </p>

        {error && <div className="error-message" style={{marginBottom: '1rem'}}>{error}</div>}
        {message && <div className="success-message" style={{marginBottom: '1rem', color: '#4bc8ff'}}>{message}</div>}

        {/* 勢力設立用パネル */}
        {!userFactionId && (
          <div style={{ marginBottom: '2rem' }}>
            {!isCreating ? (
              <button 
                onClick={() => setIsCreating(true)}
                className="submit-btn"
                style={{ background: '#48bb78', padding: '10px 20px', margin: 0 }}
              >
                + 新しい勢力を設立する (10,000G)
              </button>
            ) : (
              <div className="stats-allocation" style={{ border: '1px solid #48bb78', margin: 0 }}>
                <h3 style={{ color: '#48bb78', borderBottom: '1px solid rgba(72,187,120,0.5)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>CREATE FACTION</h3>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>勢力名</label>
                  <input type="text" className="login-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="例: ホワイトベース隊" />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>イメージカラー</label>
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: '100%', height: '40px', background: 'transparent', border: 'none', cursor: 'pointer' }} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>勢力紹介文</label>
                  <textarea className="login-input" style={{ minHeight: '80px', resize: 'vertical' }} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="勢力の目的や参加条件など"></textarea>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleCreate} disabled={loading} className="submit-btn" style={{ margin: 0, flex: 1, background: '#48bb78' }}>設立する (10,000G消費)</button>
                  <button onClick={() => setIsCreating(false)} className="submit-btn" style={{ margin: 0, flex: 1, background: '#718096' }}>キャンセル</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 自分の所属勢力へのショートカット */}
        {userFactionId && userFactionId > 0 && (
           <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
             <button onClick={() => navigate(`/faction/${userFactionId}`)} className="submit-btn" style={{ padding: '15px 30px', fontSize: '1.2rem', margin: 0, background: 'linear-gradient(90deg, #4facfe 0%, #00f2fe 100%)' }}>
               所属している勢力の司令室へ
             </button>
           </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.1)', textAlign: 'left' }}>
                <th style={{ padding: '1rem' }}>勢力名</th>
                <th style={{ padding: '1rem' }}>リーダー</th>
                <th style={{ padding: '1rem' }}>メンバー数</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>アクション</th>
              </tr>
            </thead>
            <tbody>
              {factions.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '15px', height: '15px', background: f.color, borderRadius: '50%', border: '1px solid #fff' }}></div>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#4facfe', fontSize: '1.1rem' }}>{f.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '4px' }}>{f.description}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: '#ecc94b' }}>{f.leader_name}</td>
                  <td style={{ padding: '1rem' }}>{f.member_count} 名</td>
                  <td style={{ padding: '1rem', textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    {!userFactionId && (
                      <button 
                        onClick={() => handleJoin(f.id)}
                        disabled={loading}
                        className="submit-btn"
                        style={{ padding: '0.5rem 1rem', margin: 0, flex: 1, background: '#48bb78' }}
                      >
                        加入する
                      </button>
                    )}
                    <button 
                      onClick={() => navigate(`/faction/${f.id}`)}
                      className="text-btn"
                      style={{ padding: '0.5rem 1rem', margin: 0, flex: 1, border: '1px solid #aaa' }}
                    >
                      詳細を見る
                    </button>
                  </td>
                </tr>
              ))}
              {factions.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>
                    設立されている勢力はまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
