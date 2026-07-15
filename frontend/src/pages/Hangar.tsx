import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; 
import { UnitImage } from '../components/UnitImage';

interface HangarUnit {
  hangar_id: number;
  unit_id: number;
  name: string;
  hp: number;
  en: number;
  armor: number;
  mobility: number;
  sensor: number;
  image: string;
  description: string;
  price: number;
  unit_lv: number;
  max_weight: number;
  kaisyo: number;
  current_hp: number;
  current_en: number;
}

export const Hangar: React.FC = () => {
  const navigate = useNavigate();
  const [units, setUnits] = useState<HangarUnit[]>([]);
  const [currentUnitId, setCurrentUnitId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [discardConfirmModal, setDiscardConfirmModal] = useState<{isOpen: boolean, hangarId: number | null, unitName: string}>({isOpen: false, hangarId: null, unitName: ''});
  const [sortConfig, setSortConfig] = useState<{key: keyof HangarUnit, direction: 'asc'|'desc'} | null>(null);
  const [updateChampion, setUpdateChampion] = useState(false);
  const [isChampion, setIsChampion] = useState(false);

  const fetchHangar = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) {
      navigate('/');
      return;
    }
    try {
      const response = await fetch('/api/hangar', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setUnits(data.hangar);
      } else {
        setError(data.message);
      }

      const profileRes = await fetch('/api/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const profileData = await profileRes.json() as any;
      
      const champRes = await fetch('/api/champion', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const champData = await champRes.json() as any;
      
      if (profileData.success && profileData.user) {
        setCurrentUnitId(profileData.user.unit_id);
        const myId = profileData.user.id;
        const indChamp = champData.individual?.champion_id;
        const teamChamp = champData.team?.champion_id;
        if (myId && (myId === indChamp || myId === teamChamp || champData.is_defender === true)) {
          setIsChampion(true);
        }
      }
    } catch (err) {
      setError('データの取得に失敗しました');
    }
  };

  useEffect(() => {
    fetchHangar();
  }, [navigate]);

  const handleEquip = async (unit: HangarUnit) => {
    const token = localStorage.getItem('gtactics_token');
    try {
      const response = await fetch('/api/hangar/equip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ hangar_id: unit.hangar_id, update_champion: updateChampion })
      });
      const data = await response.json() as any;
      if (data.success) {
        setMessage(unit.name + ' に乗り換えました');
        fetchHangar();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('乗り換えに失敗しました');
    }
    setTimeout(() => { setMessage(''); setError(''); }, 3000);
  };

  const handleSeibi = async (hangarId: number) => {
    const token = localStorage.getItem('gtactics_token');
    try {
      const response = await fetch('/api/seibi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ hangar_id: hangarId })
      });
      const data = await response.json() as any;
      if (data.success) {
        setMessage(data.message);
        fetchHangar();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('整備に失敗しました');
    }
    setTimeout(() => { setMessage(''); setError(''); }, 3000);
  };

  const handleDiscard = async () => {
    if (!discardConfirmModal.hangarId) return;
    const token = localStorage.getItem('gtactics_token');
    try {
      const response = await fetch('/api/hangar/discard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ hangar_id: discardConfirmModal.hangarId })
      });
      const data = await response.json() as any;
      if (data.success) {
        setMessage(data.message);
        fetchHangar();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('廃棄に失敗しました');
    }
    setDiscardConfirmModal({isOpen: false, hangarId: null, unitName: ''});
    setTimeout(() => { setMessage(''); setError(''); }, 3000);
  };

  const handleSort = (key: keyof HangarUnit) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedUnits = [...units].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
    if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '900px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>HANGAR (格納庫)</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn">マイページに戻る</button>
        </div>

        {error && <div className="error-message" style={{marginBottom: '1rem'}}>{error}</div>}
        {message && (
          <div style={{ background: 'rgba(72, 187, 120, 0.2)', color: '#48bb78', padding: '10px', borderRadius: '4px', marginBottom: '1rem', border: '1px solid #48bb78', textAlign: 'center' }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px' }}>
          <span style={{ color: '#aaa', alignSelf: 'center', fontSize: '0.85rem' }}>SORT:</span>
          {(['name', 'price', 'unit_lv', 'hp', 'en', 'armor', 'mobility', 'sensor', 'max_weight'] as (keyof HangarUnit)[]).map((key) => {
            const labels: any = { name: '機体名', price: 'コスト', unit_lv: '機体Lv', hp: '耐久', en: 'EN', armor: '装甲', mobility: '運動', sensor: '索敵', max_weight: '装備重量' };
            const isActive = sortConfig?.key === key;
            return (
              <button 
                key={key} 
                onClick={() => handleSort(key)}
                style={{ 
                  background: isActive ? 'rgba(79, 172, 254, 0.2)' : 'transparent',
                  border: isActive ? '1px solid #4facfe' : '1px solid #444',
                  color: isActive ? '#4facfe' : '#aaa',
                  padding: '2px 8px', fontSize: '0.8rem', borderRadius: '4px', cursor: 'pointer'
                }}
              >
                {labels[key]} {isActive ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </button>
            )
          })}
        </div>

        {isChampion && (
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" id="updateChampion" checked={updateChampion} onChange={(e) => setUpdateChampion(e.target.checked)} />
            <label htmlFor="updateChampion" style={{ color: '#fff', fontSize: '0.9rem' }}>乗換時、優勝/防衛データへ反映する</label>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sortedUnits.map((unit) => {
            const isEquipped = unit.unit_id === currentUnitId;
            const needsSeibi = unit.current_hp !== -1 && (unit.current_hp < unit.hp || unit.current_en < unit.en); // Simplified check vs base stats
            return (
              <div key={unit.hangar_id} style={{ 
                background: 'rgba(0,0,0,0.5)', 
                border: isEquipped ? '2px solid #4facfe' : '1px solid rgba(255,255,255,0.2)', 
                padding: '1rem', 
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ fontSize: '1.3rem', color: isEquipped ? '#4facfe' : '#fff', fontWeight: 'bold' }}>
                      {unit.name}
                    </div>
                    {isEquipped && <span style={{ background: '#4facfe', color: '#000', padding: '0.2rem 0.5rem', fontSize: '0.8rem', borderRadius: '4px', fontWeight: 'bold' }}>搭乗中</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {needsSeibi && (
                      <button 
                        onClick={() => handleSeibi(unit.hangar_id)}
                        className="submit-btn"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', width: 'auto', background: 'transparent', border: '1px solid #4bff7d', color: '#4bff7d' }}
                      >
                        整備
                      </button>
                    )}
                    {!isEquipped && (
                      <>
                        <button 
                          onClick={() => handleEquip(unit)}
                          className="submit-btn"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', width: 'auto', background: 'transparent', border: '1px solid #fff' }}
                        >
                          乗り換え
                        </button>
                        <button 
                          onClick={() => navigate('/trade', { state: { tab: 'sell', hangarId: unit.hangar_id } })}
                          className="submit-btn"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', width: 'auto', background: 'transparent', border: '1px solid #ffaa00', color: '#ffaa00' }}
                        >
                          出品
                        </button>
                        <button 
                          onClick={() => setDiscardConfirmModal({ isOpen: true, hangarId: unit.hangar_id, unitName: unit.name })}
                          className="submit-btn"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', width: 'auto', background: 'transparent', border: '1px solid #ff4b4b', color: '#ff4b4b' }}
                        >
                          廃棄
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                        {unit.image && (
                            <UnitImage file={unit.image} alt={unit.name} style={{ width: '100%', height: 'auto', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', marginBottom: '1rem' }} />
                        )}
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.8rem', borderRadius: '4px', fontSize: '0.9rem', lineHeight: '1.6', color: '#ddd', fontStyle: 'italic' }}>
                            {unit.description || '機体の解説はありません。'}
                        </div>
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <div className="stats-grid" style={{ gap: '0.5rem' }}>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>耐久力 (HP)</label><div style={{ color: '#fff' }}>{unit.hp}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>エネルギー (EN)</label><div style={{ color: '#fff' }}>{unit.en}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>装甲 (AR)</label><div style={{ color: '#fff' }}>{unit.armor}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>運動 (MO)</label><div style={{ color: '#fff' }}>{unit.mobility}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>索敵 (SE)</label><div style={{ color: '#fff' }}>{unit.sensor}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>コスト</label><div style={{ color: '#fff' }}>{unit.price}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>機体Lv</label><div style={{ color: '#fff' }}>{unit.unit_lv}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>機熟</label><div style={{ color: '#fff' }}>{unit.kaisyo ?? 0}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>重量</label><div style={{ color: '#fff' }}>{unit.max_weight}</div></div>
                        </div>
                    </div>
                </div>
              </div>
            );
          })}
          {units.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#aaa' }}>
              格納庫に機体がありません。
            </div>
          )}
        </div>
      </div>

      {discardConfirmModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-panel" style={{ maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <h2 className="cyber-title" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#ff4b4b' }}>DISCARD CONFIRMATION</h2>
            <p style={{ color: '#fff', marginBottom: '1rem' }}>
              本当に {discardConfirmModal.unitName} を廃棄しますか？<br />
              <span style={{ color: '#ff4b4b', fontSize: '0.9rem' }}>機体は完全に失われます</span>
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="submit-btn" onClick={handleDiscard} style={{ flex: 1, background: 'rgba(255, 75, 75, 0.2)', borderColor: '#ff4b4b', color: '#ff4b4b' }}>YES</button>
              <button className="submit-btn" onClick={() => setDiscardConfirmModal({isOpen: false, hangarId: null, unitName: ''})} style={{ flex: 1, background: 'transparent', border: '1px solid #aaa', color: '#aaa' }}>NO</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
