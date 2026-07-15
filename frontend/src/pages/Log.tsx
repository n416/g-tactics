import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css';

interface BattleLog {
  id: number;
  is_attacker_win: number;
  created_at: string;
  log_text: string;
  attacker_name: string;
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>DEFENSE LOG</h1>
          <button onClick={() => navigate('/mypage')} className="submit-btn" style={{ margin: 0, padding: '8px 16px' }}>BACK TO CENTER</button>
        </div>

        {loading ? (
          <div style={{ color: '#00f2fe', textAlign: 'center', padding: '2rem' }}>Loading logs...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : logs.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', padding: '2rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
            防衛履歴はありません。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {logs.map((log) => (
              <div key={log.id} style={{ 
                background: 'rgba(0,0,0,0.4)', 
                border: `1px solid ${log.is_attacker_win ? 'rgba(229, 62, 62, 0.5)' : 'rgba(72, 187, 120, 0.5)'}`,
                borderLeft: `4px solid ${log.is_attacker_win ? '#e53e3e' : '#48bb78'}`,
                borderRadius: '8px', 
                padding: '1.5rem',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                  <div style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 'bold' }}>
                    <span style={{ color: '#00f2fe' }}>{log.attacker_name}</span> からの襲撃
                  </div>
                  <div style={{ color: '#888', fontSize: '0.9rem' }}>
                    {new Date(log.created_at).toLocaleString('ja-JP')}
                  </div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '2rem' }}>
                  <div style={{ flex: 1, maxHeight: '150px', overflowY: 'auto', padding: '10px', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9rem', color: '#ccc', whiteSpace: 'pre-wrap' }}>
                    {log.log_text}
                  </div>
                  <div style={{ 
                    minWidth: '100px', 
                    textAlign: 'center', 
                    padding: '10px', 
                    background: log.is_attacker_win ? 'rgba(229, 62, 62, 0.2)' : 'rgba(72, 187, 120, 0.2)',
                    color: log.is_attacker_win ? '#fc8181' : '#68d391',
                    borderRadius: '4px',
                    fontWeight: 'bold'
                  }}>
                    {log.is_attacker_win ? '防衛失敗 (LOSE)' : '防衛成功 (WIN)'}
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
