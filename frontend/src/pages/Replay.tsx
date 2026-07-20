import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BattleAnimation } from '../components/BattleAnimation';
import './Register.css';

export const Replay: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAnimation, setShowAnimation] = useState(true);

  useEffect(() => {
    const fetchReplay = async () => {
      const token = localStorage.getItem('gtactics_token');
      if (!token) {
        navigate('/');
        return;
      }
      try {
        const res = await fetch(`/api/replay/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json() as any;
        if (json.success) {
          setData(json);
        } else {
          setError(json.message || '取得に失敗しました');
        }
      } catch (err) {
        setError('通信エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };
    fetchReplay();
  }, [id, navigate]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#00f2fe' }}>Loading replay...</div>;
  if (error) return <div style={{ padding: '2rem', textAlign: 'center', color: '#fc8181' }}>{error}</div>;
  if (!data) return null;

  return (
    <div className="register-container" style={{ padding: '2rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
          <div>
            <h1 className="cyber-title" style={{ fontSize: '1.5rem', margin: 0 }}>BATTLE REPLAY</h1>
            <div style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              {new Date(data.created_at).toLocaleString('ja-JP')} / Type: {data.battle_type}
            </div>
          </div>
          <button onClick={() => navigate('/log')} className="submit-btn" style={{ margin: 0, padding: '8px 16px' }}>BACK TO LOG</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'center', color: '#00f2fe', fontSize: '1.2rem', fontWeight: 'bold' }}>{data.attacker_name}</div>
          <div style={{ color: '#f59e0b', fontStyle: 'italic', fontSize: '1.5rem' }}>VS</div>
          <div style={{ textAlign: 'center', color: '#ef4444', fontSize: '1.2rem', fontWeight: 'bold' }}>{data.defender_name}</div>
        </div>

        {showAnimation && (
          <div style={{ position: 'relative', width: '100%', height: '650px', background: '#0f172a', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
            <BattleAnimation
              events={data.events}
              meta={data.meta}
              onClose={() => setShowAnimation(false)}
            />
          </div>
        )}

        {!showAnimation && (
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <button className="submit-btn" onClick={() => setShowAnimation(true)}>もう一度見る (REPLAY)</button>
          </div>
        )}

        <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '4px' }}>
          <h3 style={{ color: '#aaa', margin: '0 0 1rem 0', fontSize: '1rem' }}>戦闘ログ</h3>
          <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#ccc', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto' }}>
            {data.log_text}
          </div>
        </div>
      </div>
    </div>
  );
};
