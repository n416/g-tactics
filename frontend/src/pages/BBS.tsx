import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../components/toast';
import './Register.css';

interface BBSMessage {
  id: number;
  character_id: string;
  chara_name: string;
  title: string;
  message: string;
  created_at: string;
}

export const BBS: React.FC = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<BBSMessage[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const response = await fetch('/api/messages/bbs', {
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
      setError('掲示板の取得に失敗しました');
    }
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const token = localStorage.getItem('gtactics_token');
    if (!token) {
      showToast('投稿にはログインが必要です', 'error');
      navigate('/');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/messages/bbs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, message })
      });
      const data = await response.json() as any;
      if (data.success) {
        setTitle('');
        setMessage('');
        fetchMessages();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('投稿に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '800px', width: '100%', display: 'flex', flexDirection: 'column', height: '85vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>GLOBAL BBS</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn">BACK</button>
        </div>

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflowY: 'auto' }}>
          
          <div className="stats-allocation" style={{ marginTop: 0, padding: '1rem' }}>
            <h3>新規投稿</h3>
            <form onSubmit={handlePost} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>タイトル (任意)</label>
                <input 
                  type="text" 
                  className="cyber-input" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={50}
                  placeholder="件名..."
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>本文</label>
                <textarea 
                  className="cyber-input" 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  required
                  placeholder="掲示板に書き込む内容..."
                />
              </div>
              <button type="submit" disabled={isSubmitting} className="submit-btn" style={{ margin: 0, alignSelf: 'flex-end' }}>
                {isSubmitting ? '投稿中...' : '投稿する'}
              </button>
            </form>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)', flex: 1, overflowY: 'auto' }}>
            {messages.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>投稿はありません</div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--accent-color)' }}>
                      {msg.title ? `「${msg.title}」` : '無題'}
                    </div>
                    <div className="small" style={{ color: 'var(--text-secondary)' }}>
                      No.{msg.id} / {new Date(msg.created_at).toLocaleString('ja-JP')}
                    </div>
                  </div>
                  <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                    投稿者: <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{msg.chara_name}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                    {msg.message}
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
