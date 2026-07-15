import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
  id: string;
  handle_name: string;
  chara_name: string;
  unit_name: string | null;
  money: number;
  fame: number;
  exp: number;
  level: number;
  created_at: string;
}

export const Admin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  // フォームステート
  const [grantForms, setGrantForms] = useState<{[key: string]: { money: number, fame: number, exp: number, level: number }}>({});

  // 大会作成ステート
  const [tName, setTName] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tPrize, setTPrize] = useState(0);
  const [tEntry, setTEntry] = useState(0);
  const [tLimit, setTLimit] = useState(16);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      if (!token) {
        navigate('/');
        return;
      }
      const response = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setUsers(data.users);
        const forms: any = {};
        data.users.forEach((u: User) => {
          forms[u.id] = { money: 0, fame: 0, exp: 0, level: 0 };
        });
        setGrantForms(forms);
      } else {
        setError(data.message);
        if (data.message === 'Forbidden') {
          navigate('/mypage');
        }
      }
    } catch (err) {
      setError('サーバーとの通信に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [navigate]);

  const handleGrant = async (userId: string) => {
    const form = grantForms[userId];
    if (!form) return;
    
    if (form.money === 0 && form.fame === 0 && form.exp === 0 && form.level === 0) {
      setMessage('付与する値がすべて0です。');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('gtactics_token');
      const response = await fetch(`/api/admin/users/${userId}/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ money_add: form.money, fame_add: form.fame, exp_add: form.exp, level_add: form.level })
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage(`ID:${userId} に付与しました。`);
        fetchUsers(); // リロード
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleHeal = async (userId: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('gtactics_token');
      const response = await fetch(`/api/admin/users/${userId}/heal`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage(`ID:${userId} の機体を全回復しました。`);
        fetchUsers();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleResetNt = async (userId: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('gtactics_token');
      const response = await fetch(`/api/admin/users/${userId}/reset_nt`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage(data.message);
        fetchUsers();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTournament = async () => {
    if (!tName) {
      setMessage('');
      setError('大会名を入力してください');
      return;
    }
    try {
      setLoading(true);
      const token = localStorage.getItem('gtactics_token');
      const response = await fetch(`/api/tournaments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: tName,
          description: tDesc,
          prize_money: tPrize,
          entry_fee: tEntry,
          participant_limit: tLimit
        })
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage('大会を作成しました！');
        setError('');
        setTName('');
        setTDesc('');
        setTPrize(0);
        setTEntry(0);
        setTLimit(16);
      } else {
        setError(data.message);
        setMessage('');
      }
    } catch (err) {
      setError('通信エラーが発生しました');
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (userId: string, field: 'money' | 'fame' | 'exp' | 'level', value: number) => {
    setGrantForms(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value
      }
    }));
  };

  if (loading) {
    return <div className="register-container"><div style={{color: 'var(--accent-color)'}}>LOADING...</div></div>;
  }

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>ADMIN PANEL</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn">RETURN TO BASE</button>
        </div>

        {error && <div className="error-message" style={{marginBottom: '1rem'}}>{error}</div>}
        {message && <div className="success-message" style={{marginBottom: '1rem'}}>{message}</div>}

        <div className="premium-glass-panel" style={{ marginBottom: '2rem', marginTop: '1rem' }}>
          <h2 className="cyber-title" style={{ fontSize: '1.4rem', marginBottom: '0.5rem', color: 'var(--accent-color)', textAlign: 'left' }}>
            <span style={{ marginRight: '0.5rem' }}>🏆</span>CREATE TOURNAMENT
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.6' }}>
            公式大会を作成します。管理者の所持金は消費されず、システムから賞金が支給されます。<br/>
            作成後、ただちにエントリーの受付が開始されます。
          </p>
          <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
            <div className="cyber-input-wrapper">
              <label className="cyber-label">大会名 <span style={{ color: 'var(--accent-color)' }}>*</span></label>
              <input type="text" className="cyber-input" value={tName} onChange={e => setTName(e.target.value)} placeholder="例：第X回 公式トーナメント" />
            </div>
            <div className="cyber-input-wrapper">
              <label className="cyber-label">参加定員</label>
              <input type="number" className="cyber-input" value={tLimit} onChange={e => setTLimit(Number(e.target.value))} min={2} />
            </div>
            <div className="cyber-input-wrapper" style={{ gridColumn: '1 / -1' }}>
              <label className="cyber-label">説明・宣伝文句</label>
              <textarea className="cyber-input" value={tDesc} onChange={e => setTDesc(e.target.value)} rows={3} placeholder="アピールポイントなどを記入" />
            </div>
            <div className="cyber-input-wrapper">
              <label className="cyber-label accent">優勝賞金 (システム支給)</label>
              <input type="number" className="cyber-input accent" value={tPrize} onChange={e => setTPrize(Number(e.target.value))} min={0} />
            </div>
            <div className="cyber-input-wrapper">
              <label className="cyber-label">参加費</label>
              <input type="number" className="cyber-input" value={tEntry} onChange={e => setTEntry(Number(e.target.value))} min={0} />
            </div>
          </div>
          <button className="cyber-button-primary" onClick={handleCreateTournament} disabled={loading}>
            CREATE TOURNAMENT (公式枠)
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--accent-color)', color: 'var(--accent-color)', textAlign: 'left' }}>
                <th style={{ padding: '0.8rem' }}>Handle / Chara</th>
                <th style={{ padding: '0.8rem' }}>Unit</th>
                <th style={{ padding: '0.8rem' }}>Stats</th>
                <th style={{ padding: '0.8rem' }}>Grant</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '0.8rem' }}>
                    <div style={{ fontWeight: 'bold' }}>{u.handle_name}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{u.chara_name}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>ID: {u.id}</div>
                  </td>
                  <td style={{ padding: '0.8rem', color: 'var(--text-primary)' }}>{u.unit_name || '-'}</td>
                  <td style={{ padding: '0.8rem' }}>
                    <span style={{ color: 'var(--accent-color)' }}>{u.money}G</span> / 
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '5px' }}>名声{u.fame || 0}</span> / 
                    <span style={{ color: 'var(--accent-color)', marginLeft: '5px' }}>Lv.{u.level} ({u.exp}EXP)</span>
                  </td>
                  <td style={{ padding: '0.5rem', minWidth: '300px' }}>
                    {grantForms[u.id] && (
                      <div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input 
                            type="number" 
                            placeholder="Money"
                            className="input-field"
                            style={{ width: '70px', padding: '0.3rem', fontSize: '0.8rem' }}
                            value={grantForms[u.id].money}
                            onChange={(e) => updateForm(u.id, 'money', Number(e.target.value))}
                          />
                          <input 
                            type="number" 
                            placeholder="Fame"
                            className="input-field"
                            style={{ width: '70px', padding: '0.3rem', fontSize: '0.8rem' }}
                            value={grantForms[u.id].fame}
                            onChange={(e) => updateForm(u.id, 'fame', Number(e.target.value))}
                          />
                          <input 
                            type="number" 
                            placeholder="Exp"
                            className="input-field"
                            style={{ width: '70px', padding: '0.3rem', fontSize: '0.8rem' }}
                            value={grantForms[u.id].exp}
                            onChange={(e) => updateForm(u.id, 'exp', Number(e.target.value))}
                          />
                          <input 
                            type="number" 
                            placeholder="Level"
                            className="input-field"
                            style={{ width: '70px', padding: '0.3rem', fontSize: '0.8rem' }}
                            value={grantForms[u.id].level}
                            onChange={(e) => updateForm(u.id, 'level', Number(e.target.value))}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <button className="submit-btn" style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--text-primary)', border: '1px solid var(--accent-color)' }} onClick={() => handleGrant(u.id)}>GRANT</button>
                          <button className="submit-btn" style={{ padding: '0.5rem', backgroundColor: 'var(--accent-color)', border: '1px solid var(--accent-color)', color: 'var(--text-primary)' }} onClick={() => handleHeal(u.id)}>HEAL</button>
                          <button className="submit-btn" style={{ padding: '0.5rem', backgroundColor: '#ef4444', border: '1px solid #ef4444', color: '#fff' }} onClick={() => handleResetNt(u.id)}>RESET NT</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};
