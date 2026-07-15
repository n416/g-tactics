import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; // Reusing the cyber CSS

export const Tactics: React.FC = () => {
  const navigate = useNavigate();
  const [tactics, setTactics] = useState('00');
  const [error, setError] = useState('');
  const [sysMsg, setSysMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [updateChampion, setUpdateChampion] = useState(false);
  const [isChampion, setIsChampion] = useState(false);

  useEffect(() => {
    const fetchMe = async () => {
      const token = localStorage.getItem('gtactics_token');
      if (!token) { navigate('/'); return; }

      try {
        const [res, champRes] = await Promise.all([
          fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/champion', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        const data = (await res.json()) as any;
        const champData = (await champRes.json()) as any;

        if (data.success && data.user) {
          setTactics(String(data.user.tactics || '00').padStart(2, '0'));
          
          const myId = data.user.id;
          const indChamp = champData.individual?.champion_id;
          const teamChamp = champData.team?.champion_id;
          if (myId && (myId === indChamp || myId === teamChamp || champData.is_defender === true)) {
            setIsChampion(true);
          }
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetchMe();
  }, [navigate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;

    try {
      const res = await fetch('/api/tactics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tactics, update_champion: updateChampion })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        setTimeout(() => setSysMsg(''), 3000);
      } else {
        setError(data.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    }
  };

  const setMoveTactic = (val: string) => {
    setTactics(val + tactics[1]);
  };

  const setAtkTactic = (val: string) => {
    setTactics(tactics[0] + val);
  };

  if (loading) return <div className="register-container"><div style={{color:'#00f2fe'}}>LOADING...</div></div>;

  return (
    <div className="register-container">
      <div className="glass-panel" style={{ maxWidth: '600px', width: '100%' }}>
        <h1 className="cyber-title" style={{ fontSize: '1.5rem', textAlign: 'center' }}>TACTICS CENTER</h1>
        <p style={{ textAlign: 'center', color: '#888', marginBottom: '2rem' }}>【戦術設定】</p>

        {sysMsg && <div style={{ background: 'rgba(72,187,120,0.2)', color: '#48bb78', padding: '10px', borderRadius: '4px', marginBottom: '1rem', textAlign: 'center', border: '1px solid #48bb78' }}>{sysMsg}</div>}
        {error && <div style={{ background: 'rgba(229,62,62,0.2)', color: '#fc8181', padding: '10px', borderRadius: '4px', marginBottom: '1rem', textAlign: 'center', border: '1px solid #fc8181' }}>{error}</div>}

        <form onSubmit={handleSave}>
          <div className="input-group" style={{ marginBottom: '1.5rem' }}>
            <label>移動系</label>
            <select 
              value={tactics[0] || '0'} 
              onChange={(e) => setMoveTactic(e.target.value)} 
              style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid #00f2fe', borderRadius: '4px' }}
            >
              <option value="0">特になし</option>
              <option value="1">敵を足止めする</option>
              <option value="2">移動を意識する</option>
              <option value="3">敵を補捉し移動</option>
              <option value="8">おまかせ（毎戦闘ランダム）</option>
            </select>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#aaa', lineHeight: '1.5' }}>
              ・敵を足止めする： 命中減少 回避増加 攻撃減少 防御減少 敵：移動不可（移動力0.3倍）<br/>
              ・移動を意識する： 命中通常 回避通常 攻撃通常 防御通常<br/>
              ・敵を補捉し移動： 命中増加 回避減少 攻撃増加 防御増加（移動力0.5倍）<br/>
              ・移動を意識する＜敵を足止めする＜敵を補捉し移動＜移動を意識する…という移動力の力関係<br/>
              ・特になし： 敵が移動系を設定していると移動力0.1倍
            </div>
          </div>

          <div className="input-group" style={{ marginBottom: '2rem' }}>
            <label>攻撃系</label>
            <select 
              value={tactics[1] || '4'} 
              onChange={(e) => setAtkTactic(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid #00f2fe', borderRadius: '4px' }}
            >
              <option value="0">特になし</option>
              <option value="4">攻撃重視</option>
              <option value="5">回避重視</option>
              <option value="6">撹乱重視</option>
              <option value="7">操縦重視</option>
              <option value="8">おまかせ（毎戦闘ランダム）</option>
            </select>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#aaa', lineHeight: '1.5' }}>
              ・攻撃重視： 命中増加 回避減少 攻撃増加 防御減少 敵が操縦重視だと有利（特性「攻撃的」で強化）<br/>
              ・回避重視： 命中減少 回避増加 攻撃減少 防御増加 敵が攻撃重視だと有利（特性「逃げ腰」で強化）<br/>
              ・撹乱重視： 命中増加 回避増加 攻撃減少 防御減少 敵が回避重視だと有利（特性「イタズラ好き」で強化）<br/>
              ・操縦重視： 命中通常 回避通常 攻撃通常 防御通常 敵が撹乱重視だと有利（特性「真面目」で強化）<br/>
              ・（何も重視しない敵は、必ず命中と回避が減少する）<br/>
              ・攻撃重視＜回避重視＜撹乱重視＜操縦重視＜攻撃重視…という力関係
            </div>
          </div>

          {isChampion && (
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
              <input type="checkbox" id="updateChampion" checked={updateChampion} onChange={(e) => setUpdateChampion(e.target.checked)} />
              <label htmlFor="updateChampion" style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 'bold' }}>戦術変更時、優勝/防衛データへ反映する</label>
            </div>
          )}

          <button type="submit" className="submit-btn" style={{ width: '100%', background: '#4299e1', color: 'white', padding: '12px', fontSize: '1.1rem', marginBottom: '1rem' }}>
            戦術セット
          </button>
          <button type="button" onClick={() => navigate('/mypage')} className="submit-btn" style={{ width: '100%', background: '#4a5568', color: 'white', padding: '12px', fontSize: '1.1rem', margin: 0 }}>
            マイページへ戻る
          </button>
        </form>
      </div>
    </div>
  );
};
