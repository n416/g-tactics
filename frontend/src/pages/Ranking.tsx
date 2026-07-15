import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; 

interface PlayerInfo {
  id: string;
  handle_name: string;
  chara_name: string;
  level: number;
  exp: number;
  unit_name: string;
  fame: number;
  money: number;
  win_rate: number;
  total_battles: number;
  kill_count: number;
  champ_wins: number;
  cls: string;
  cv: string;
  days_since_last_battle: number;
}

type SortKey = 'exp' | 'winrate' | 'fame' | 'rank' | 'level' | 'name' | 'kill_count' | 'champ_count';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'exp', label: '総合(EXP)' },
  { key: 'winrate', label: '勝率' },
  { key: 'fame', label: '名声' },
  { key: 'rank', label: '階級' },
  { key: 'level', label: '機体Lv' },
  { key: 'name', label: '名前' },
  { key: 'kill_count', label: '撃墜数' },
  { key: 'champ_count', label: '優勝数' },
];

interface FactionRankingInfo {
  id: number;
  name: string;
  influence: number;
  leader_name: string;
  member_count: number;
}

export const Ranking: React.FC = () => {
  const navigate = useNavigate();
  const [playerRanking, setPlayerRanking] = useState<PlayerInfo[]>([]);
  const [factionRanking, setFactionRanking] = useState<FactionRankingInfo[]>([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'player' | 'faction'>('player');
  const [sortKey, setSortKey] = useState<SortKey>('exp');

  useEffect(() => {
    const fetchRanking = async () => {
      try {
        const query = sortKey === 'exp' ? '' : '?sort=' + sortKey;
        const response = await fetch('/api/ranking' + query);
        const data = (await response.json()) as any;
        if (data.success) {
          setPlayerRanking(data.ranking);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('ランキングデータの取得に失敗しました');
      }
    };

    fetchRanking();
  }, [sortKey]);

  useEffect(() => {
    const fetchFactionRanking = async () => {
      try {
        const response = await fetch('/api/factions/ranking');
        const data = (await response.json()) as any;
        if (data.success) {
          setFactionRanking(data.ranking);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('勢力ランキングデータの取得に失敗しました');
      }
    };

    fetchFactionRanking();
  }, []);

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>RANKING (TOP 100)</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn">RETURN TO BASE</button>
        </div>

        {error && <div className="error-message" style={{marginBottom: '1rem'}}>{error}</div>}

        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.2)', marginBottom: '1rem' }}>
          <button 
            style={{ flex: 1, background: 'none', border: 'none', padding: '0.75rem', color: activeTab === 'player' ? '#4facfe' : '#aaa', borderBottom: activeTab === 'player' ? '2px solid #4facfe' : 'none', fontWeight: 'bold', cursor: 'pointer' }}
            onClick={() => setActiveTab('player')}
          >
            PLAYER RANKING
          </button>
          <button 
            style={{ flex: 1, background: 'none', border: 'none', padding: '0.75rem', color: activeTab === 'faction' ? '#4facfe' : '#aaa', borderBottom: activeTab === 'faction' ? '2px solid #4facfe' : 'none', fontWeight: 'bold', cursor: 'pointer' }}
            onClick={() => setActiveTab('faction')}
          >
            FACTION RANKING
          </button>
        </div>

        {activeTab === 'player' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{ color: '#aaa', alignSelf: 'center', fontSize: '0.85rem' }}>SORT BY</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                className="text-btn"
                style={{
                  padding: '0.35rem 0.8rem',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  borderRadius: '4px',
                  border: sortKey === opt.key ? '1px solid #4facfe' : '1px solid rgba(255,255,255,0.2)',
                  background: sortKey === opt.key ? 'rgba(79,172,254,0.15)' : 'transparent',
                  color: sortKey === opt.key ? '#4facfe' : '#aaa',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          {activeTab === 'player' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.1)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>Rank</th>
                  <th style={{ padding: '0.75rem' }}>CLS</th>
                  <th style={{ padding: '0.75rem' }}>パイロット</th>
                  <th style={{ padding: '0.75rem' }}>機体</th>
                  <th style={{ padding: '0.75rem' }}>勝率</th>
                  <th style={{ padding: '0.75rem' }}>戦闘数</th>
                  <th style={{ padding: '0.75rem' }}>撃墜数</th>
                  <th style={{ padding: '0.75rem' }}>名声/現預金</th>
                  <th style={{ padding: '0.75rem' }}>cv</th>
                  <th style={{ padding: '0.75rem' }}>最終戦闘から</th>
                  <th style={{ padding: '0.75rem' }}>優勝</th>
                </tr>
              </thead>
              <tbody>
                {playerRanking.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 'bold', color: i < 3 ? '#fbbf24' : '#fff' }}>{i + 1}</td>
                    <td style={{ padding: '0.75rem', color: '#90cdf4' }}>{p.cls || '-'}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span onClick={() => navigate(`/profile/${p.id}`)} style={{ color: '#4facfe', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }} title="ステ詳細・伝言を送る">{p.handle_name}</span><br />
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>{p.chara_name}</span>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#ccc' }}>{p.unit_name || '無し'}</td>
                    <td style={{ padding: '0.75rem' }}>{Number(p.win_rate).toFixed(1)}%</td>
                    <td style={{ padding: '0.75rem' }}>{p.total_battles || 0}</td>
                    <td style={{ padding: '0.75rem', color: '#f56565' }}>{p.kill_count || 0}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ color: '#f6ad55' }}>{p.fame || 0}</span> / <span style={{ color: '#48bb78' }}>{p.money || 0}G</span>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#a0aec0' }}>{p.cv || '0.00'}</td>
                    {/* 本作改変: 自動削除は行わないため予告(赤字)は撤去し、活動状況の情報表示に置換 */}
                    <td style={{ padding: '0.75rem', color: '#a0aec0' }}>{p.days_since_last_battle}日</td>
                    <td style={{ padding: '0.75rem', color: '#ecc94b', fontWeight: 'bold' }}>{p.champ_wins > 0 ? p.champ_wins + '回' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'faction' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.1)', textAlign: 'left' }}>
                  <th style={{ padding: '1rem' }}>Rank</th>
                  <th style={{ padding: '1rem' }}>勢力名</th>
                  <th style={{ padding: '1rem' }}>総督</th>
                  <th style={{ padding: '1rem' }}>支配力</th>
                  <th style={{ padding: '1rem' }}>所属人数</th>
                </tr>
              </thead>
              <tbody>
                {factionRanking.map((f, i) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '1rem', fontWeight: 'bold', color: i < 3 ? '#fbbf24' : '#fff' }}>{i + 1}</td>
                    <td style={{ padding: '1rem', color: '#4facfe', fontWeight: 'bold' }}>{f.name}</td>
                    <td style={{ padding: '1rem' }}>{f.leader_name}</td>
                    <td style={{ padding: '1rem', color: '#ecc94b' }}>{f.influence}</td>
                    <td style={{ padding: '1rem' }}>{f.member_count}名</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
