import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; // Reuse existing glassmorphism styles

interface ChatMessage {
  id: number;
  character_id: string;
  chara_name: string;
  faction_id: number;
  faction_name: string | null;
  faction_color: string | null;
  message: string;
  is_faction_only: number;
  created_at: string;
}

export const Chat: React.FC = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isFactionOnly, setIsFactionOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reloadInterval, setReloadInterval] = useState(180); // Default 180s = 3 mins
  const [error, setError] = useState('');
  const [myId, setMyId] = useState('');

  const fetchMessages = useCallback(async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) {
      navigate('/');
      return;
    }

    try {
      const url = `/api/messages/chat${showAll ? '?all=1' : ''}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json() as any;
      if (data.success) {
        setMessages(data.messages);
        setError('');
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('チャットの取得に失敗しました');
    }
  }, [showAll, navigate]);

  const fetchMyId = useCallback(async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const response = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json() as any;
      if (data.success && data.user) {
        setMyId(data.user.id);
      }
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchMyId();
  }, [fetchMyId]);

  useEffect(() => {
    fetchMessages();
    let timer: ReturnType<typeof setInterval> | null = null;
    if (reloadInterval > 0) {
      timer = setInterval(() => {
        fetchMessages();
      }, reloadInterval * 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [fetchMessages, reloadInterval]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const token = localStorage.getItem('gtactics_token');
    if (!token) return;

    try {
      const response = await fetch('/api/messages/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: inputMessage, is_faction_only: isFactionOnly })
      });
      const data = await response.json() as any;
      if (data.success) {
        setInputMessage('');
        fetchMessages();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('送信に失敗しました');
    }
  };

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '800px', width: '100%', display: 'flex', flexDirection: 'column', height: '80vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>CHAT STREAM</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn">BACK</button>
        </div>

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
          {messages.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>メッセージはありません</div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.character_id === myId;
              const color = msg.faction_color || 'var(--text-primary)';
              const nameDisplay = msg.faction_name ? `${msg.chara_name}さん (${msg.faction_name})` : `${msg.chara_name}さん`;
              
              return (
                <div key={msg.id} style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 'bold', color: color }}>{nameDisplay}</span>
                    <span style={{ color: isMine ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                      {isMine ? ' ＞ 「' : ' ＞ 「' }
                      <b style={{ fontWeight: isMine ? 'normal' : 'bold' }}>{msg.message}</b>
                      {'」'}
                    </span>
                    <span className="small" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>({new Date(msg.created_at).toLocaleString('ja-JP')})</span>
                    {msg.is_faction_only === 1 && <span className="small" style={{ color: 'var(--accent-color)', fontSize: '0.8rem' }}>【専用】</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSend} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              className="cyber-input" 
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="メッセージを入力..."
              style={{ flex: 1 }}
              maxLength={200}
            />
            <button type="submit" className="submit-btn" style={{ margin: 0, padding: '0 1.5rem' }}>送信</button>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={isFactionOnly} 
                onChange={(e) => setIsFactionOnly(e.target.checked)} 
              />
              勢力内用
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showAll} 
                onChange={(e) => setShowAll(e.target.checked)} 
              />
              全て表示
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>自動リロード:</span>
              <select 
                className="cyber-input" 
                style={{ width: '100px', padding: '0.2rem' }}
                value={reloadInterval}
                onChange={(e) => setReloadInterval(Number(e.target.value))}
              >
                <option value={0}>なし</option>
                <option value={30}>30秒</option>
                <option value={60}>60秒</option>
                <option value={180}>180秒</option>
              </select>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
