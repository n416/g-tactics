import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; 

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [news, setNews] = useState<any[]>([]);
  const [homeInfo, setHomeInfo] = useState<any>(null);

  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then((d: any) => { if (d.success) setNews(d.news); })
      .catch(() => {});

    fetch('/api/home/info')
      .then(r => r.json())
      .then((d: any) => { if (d.success) setHomeInfo(d); })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!id || !password) {
      setError('IDとパスワードを入力してください');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password })
      });

      const data = (await response.json()) as any;
      if (data.success) {
        localStorage.setItem('gtactics_token', data.token);
        navigate('/mypage');
      } else {
        setError(data.message || 'ログインに失敗しました');
      }
    } catch (err) {
      console.error(err);
      setError('サーバーエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="glass-panel" style={{ textAlign: 'center', maxWidth: '600px', width: '100%' }}>
        <h1 className="cyber-title" style={{ fontSize: '1.8rem' }}>G-Tactics</h1>
        <p className="subtitle">Legacy CGI Remake</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginTop: '2rem' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ textAlign: 'left' }}>
                <label>ID</label>
                <input type="text" value={id} onChange={e => setId(e.target.value)} placeholder="ログインID" autoComplete="username" />
              </div>
              <div className="form-group" style={{ textAlign: 'left' }}>
                <label>パスワード</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="パスワード" autoComplete="current-password" />
              </div>

              <button type="submit" className="submit-btn" disabled={loading} style={{ marginTop: '1rem' }}>
                {loading ? 'AUTHENTICATING...' : 'LOGIN'}
              </button>
            </form>

            <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
              <p style={{ color: '#8892b0', fontSize: '0.9rem', marginBottom: '1rem' }}>新規パイロット登録はこちら</p>
              <button 
                className="submit-btn" 
                style={{ background: 'transparent', border: '1px solid #4facfe', color: '#4facfe', width: '100%' }}
                onClick={() => navigate('/register')}
              >
                CHARACTER CREATION
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: '250px', textAlign: 'left', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '2rem' }}>
            <h3 style={{ color: '#4facfe', borderBottom: '1px solid #4facfe', paddingBottom: '0.5rem', marginBottom: '1rem' }}>HOME情勢</h3>
            
            <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ color: '#fbbf24', fontSize: '0.9rem', marginBottom: '0.5rem' }}>現在の優勝者</h4>
                <div style={{ color: '#fff', fontSize: '1rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                    <div>
                        個人戦: {homeInfo?.individual_champion
                            ? <>{homeInfo.individual_champion.chara_name} ({homeInfo.individual_champion.handle_name}) <span style={{ color: '#aaa', fontSize: '0.8rem' }}>{homeInfo.individual_champion.win_count}連勝中</span></>
                            : <span style={{ color: '#aaa' }}>なし</span>}
                    </div>
                    <div style={{ marginTop: '0.3rem' }}>
                        チーム戦: {homeInfo?.team_champion
                            ? <>{homeInfo.team_champion.chara_name} <span style={{ color: '#aaa', fontSize: '0.8rem' }}>{homeInfo.team_champion.win_count}連勝中</span></>
                            : <span style={{ color: '#aaa' }}>なし</span>}
                    </div>
                </div>
            </div>

            {homeInfo?.events && homeInfo.events.length > 0 && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', textAlign: 'left' }}>
                <p style={{ color: '#8892b0', fontSize: '0.8rem', marginBottom: '0.5rem' }}>【近況・情勢】</p>
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {homeInfo.events.map((e: any) => (
                    <div key={e.id} style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.7 }}>
                      ・{e.message} <span style={{ color: '#555', fontSize: '0.7rem' }}>({new Date(e.created_at).toLocaleDateString()})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {news.length > 0 && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', textAlign: 'left' }}>
                <p style={{ color: '#8892b0', fontSize: '0.8rem', marginBottom: '0.5rem' }}>【お知らせ】</p>
                {news.map((n: any) => (
                  <div key={n.id} style={{ fontSize: '0.8rem', color: n.color || '#cbd5e1', lineHeight: 1.7 }}>
                    ・{n.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
