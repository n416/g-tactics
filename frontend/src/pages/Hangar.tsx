import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
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
        <div className="page-head">
          <div>
            <div className="page-eyebrow">Hangar</div>
            <h1 className="page-title">格納庫</h1>
          </div>
          <button onClick={() => navigate('/mypage')} className="btn sm">マイページへ</button>
        </div>

        {error && <div className="msg err">{error}</div>}
        {message && <div className="msg ok">{message}</div>}

        <div className="chip-row" style={{ marginBottom: '1rem', background: 'var(--panel-inset)', padding: '0.5rem 0.8rem', borderRadius: 'var(--radius)' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>並び替え:</span>
          {(['name', 'price', 'unit_lv', 'hp', 'en', 'armor', 'mobility', 'sensor', 'max_weight'] as (keyof HangarUnit)[]).map((key) => {
            const labels: any = { name: '機体名', price: 'コスト', unit_lv: '機体Lv', hp: '耐久', en: 'EN', armor: '装甲', mobility: '運動', sensor: '索敵', max_weight: '装備重量' };
            const isActive = sortConfig?.key === key;
            return (
              <button
                key={key}
                onClick={() => handleSort(key)}
                className={`btn sm ${isActive ? 'primary' : ''}`}
              >
                {labels[key]} {isActive ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </button>
            )
          })}
        </div>

        {isChampion && (
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" id="updateChampion" checked={updateChampion} onChange={(e) => setUpdateChampion(e.target.checked)} />
            <label htmlFor="updateChampion" style={{ fontSize: '0.9rem' }}>乗換時、優勝/防衛データへ反映する</label>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sortedUnits.map((unit) => {
            const isEquipped = unit.unit_id === currentUnitId;
            const needsSeibi = unit.current_hp !== -1 && (unit.current_hp < unit.hp || unit.current_en < unit.en); // Simplified check vs base stats
            return (
              <div key={unit.hangar_id} className="inset-panel" style={{
                borderColor: isEquipped ? 'var(--accent-color)' : undefined,
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div style={{ fontSize: '1.15rem', color: isEquipped ? 'var(--accent-cyan)' : 'var(--text-primary)', fontWeight: 'bold' }}>
                      {unit.name}
                    </div>
                    {isEquipped && <span style={{ background: 'var(--accent-color)', color: '#fff', padding: '0.15rem 0.5rem', fontSize: '0.75rem', borderRadius: 'var(--radius)', fontWeight: 'bold' }}>搭乗中</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {needsSeibi && (
                      <button onClick={() => handleSeibi(unit.hangar_id)} className="btn sm">
                        整備
                      </button>
                    )}
                    {!isEquipped && (
                      <>
                        <button onClick={() => handleEquip(unit)} className="btn sm primary">
                          乗り換え
                        </button>
                        <button onClick={() => navigate('/trade', { state: { tab: 'sell', hangarId: unit.hangar_id } })} className="btn sm warn">
                          出品
                        </button>
                        <button onClick={() => setDiscardConfirmModal({ isOpen: true, hangarId: unit.hangar_id, unitName: unit.name })} className="btn sm danger">
                          廃棄
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="row-wrap" style={{ gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: '250px', display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {unit.image && (
                            <div className="unit-frame lg">
                              <UnitImage file={unit.image} alt={unit.name} />
                            </div>
                        )}
                        <div style={{ flex: 1, minWidth: '160px', background: 'rgba(0,0,0,0.25)', padding: '0.8rem', borderRadius: 'var(--radius)', fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            {unit.description || '機体の解説はありません。'}
                        </div>
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <div className="stats-grid" style={{ gap: '0.5rem' }}>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>耐久力 (HP)</label><div>{unit.hp}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>エネルギー (EN)</label><div>{unit.en}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>装甲 (AR)</label><div>{unit.armor}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>運動 (MO)</label><div>{unit.mobility}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>索敵 (SE)</label><div>{unit.sensor}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>コスト</label><div>{unit.price}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>機体Lv</label><div>{unit.unit_lv}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>機熟</label><div>{unit.kaisyo ?? 0}</div></div>
                            <div className="stat-row" style={{ padding: '0.3rem' }}><label>重量</label><div>{unit.max_weight}</div></div>
                        </div>
                    </div>
                </div>
              </div>
            );
          })}
          {units.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              格納庫に機体がありません。
            </div>
          )}
        </div>
      </div>

      {/* 機体の廃棄は取り消せないので、オーバーレイクリックや ESC では閉じない */}
      <Modal
        open={discardConfirmModal.isOpen}
        onClose={() => setDiscardConfirmModal({ isOpen: false, hangarId: null, unitName: '' })}
        title="機体を廃棄する"
        dismissable={false}
        actions={
          <>
            <button className="text-btn" onClick={() => setDiscardConfirmModal({ isOpen: false, hangarId: null, unitName: '' })}>
              キャンセル
            </button>
            <button className="submit-btn" onClick={handleDiscard} style={{ background: 'var(--danger)' }}>
              廃棄する
            </button>
          </>
        }
      >
        <p style={{ color: 'var(--text-primary)' }}>
          本当に {discardConfirmModal.unitName} を廃棄しますか？<br />
          <span style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>機体は完全に失われます。取り消せません。</span>
        </p>
      </Modal>
    </div>
  );
};
