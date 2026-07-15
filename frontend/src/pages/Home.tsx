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
    <div className="auth-container">
      <div className="glass-panel" style={{ textAlign: 'center', maxWidth: '760px', width: '100%' }}>
        <h1 className="cyber-title" style={{ fontSize: '1.8rem' }}>G-Tactics</h1>
        <p className="subtitle">Legacy CGI Remake</p>

        <div className="home-cols">
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

            {/* Google 経路。ログインも新規登録もここから始まる（未登録なら登録画面へ回る）。
              * 遷移先は Worker のルートで、そこから Google の同意画面へ 302 する。 */}
            <div className="auth-divider"><span>または</span></div>

            <a className="google-btn" href="/api/auth/google/start">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Google で続ける
            </a>

            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>新規パイロット登録はこちら</p>
              <button
                className="submit-btn"
                style={{ background: 'transparent', border: '1px solid var(--accent-cyan)', color: 'var(--accent-cyan)', width: '100%', marginTop: 0 }}
                onClick={() => navigate('/register')}
              >
                CHARACTER CREATION
              </button>
            </div>
          </div>

          <div className="home-aside">
            <h3 style={{ color: 'var(--accent-cyan)', borderBottom: '1px solid var(--accent-cyan)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>HOME情勢</h3>
            
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
