import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css';

interface BattleLog {
  id: number;
  is_attacker_win: number;
  created_at: string;
  log_text: string;
  attacker_name: string;
  has_replay: number;
}

export const Log: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<BattleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      const token = localStorage.getItem('gtactics_token');
      if (!token) {
        navigate('/');
        return;
      }

      try {
        const response = await fetch('/api/battle/logs', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = (await response.json()) as any;
        if (data.success) {
          setLogs(data.logs || []);
        } else {
          setError(data.message || '履歴の取得に失敗しました');
        }
      } catch (err) {
        console.error(err);
        setError('通信エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [navigate]);

  return (
    <div className="register-container" style={{ padding: '2rem 0' }}>
      <div className="glass-panel" style={{ maxWidth: '800px', width: '100%' }}>
        <div className="page-head">
          <div>
            <div className="page-eyebrow">Battle Log</div>
            <h1 className="page-title">個別戦履歴</h1>
          </div>
          <button onClick={() => navigate('/mypage')} className="btn sm">マイページへ</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</div>
        ) : error ? (
          <div className="msg err">{error}</div>
        ) : logs.length === 0 ? (
          <div className="inset-panel" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
            個別戦履歴はありません。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {logs.map((log) => (
              <div key={log.id} className="inset-panel" style={{
                borderLeft: `3px solid ${log.is_attacker_win ? 'var(--danger)' : 'var(--success)'}`,
              }}>
                <div className="kv-row" style={{ marginBottom: '0.8rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                    <span style={{ color: 'var(--accent-cyan)' }}>{log.attacker_name}</span> からの挑戦
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {new Date(log.created_at).toLocaleString('ja-JP')}
                  </div>
                </div>

                <div className="row-wrap" style={{ alignItems: 'flex-start', gap: '1.25rem' }}>
                  <div style={{ flex: 1, minWidth: '240px', maxHeight: '150px', overflowY: 'auto', padding: '10px', background: 'rgba(0,0,0,0.35)', borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {log.log_text}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'stretch', minWidth: '140px' }}>
                    <div style={{
                      textAlign: 'center',
                      padding: '8px 10px',
                      background: log.is_attacker_win ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                      color: log.is_attacker_win ? '#f87171' : '#4ade80',
                      borderRadius: 'var(--radius)',
                      fontWeight: 'bold',
                      fontSize: '0.9rem'
                    }}>
                      {log.is_attacker_win ? '防衛失敗 (LOSE)' : '防衛成功 (WIN)'}
                    </div>
                    {log.has_replay === 1 ? (
                      <button className="btn primary sm" onClick={() => navigate(`/replay/${log.id}`)}>
                        リプレイを見る
                      </button>
                    ) : (
                      <button className="btn sm" disabled>
                        リプレイ期限切れ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
