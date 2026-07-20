import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { showToast } from '../components/toast';
import './Base.css';

interface BaseInfo {
  name: string;
  terrain: number;
  power_last_collected_at: number;
}

interface DefenseSummary {
  recentCount: number;
  winCount: number;
  loseCount: number;
  latestLogId: number | null;
  latestHasReplay: boolean;
  hasDefenseBattle: boolean;
}

interface BaseBattleSummary {
  recentCount: number;
  winCount: number;
  loseCount: number;
  lootLoss: number;
  shieldRemainingSec: number;
}

export const Base: React.FC = () => {
  const navigate = useNavigate();
  const [baseInfo, setBaseInfo] = useState<BaseInfo | null>(null);
  const [facilities, setFacilities] = useState<Record<string, number>>({});
  const [pendingIncome, setPendingIncome] = useState(0);
  const [powerRate, setPowerRate] = useState(0);
  const [defenseSummary, setDefenseSummary] = useState<DefenseSummary | null>(null);
  const [baseBattleSummary, setBaseBattleSummary] = useState<BaseBattleSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [createName, setCreateName] = useState('');
  const [createTerrain, setCreateTerrain] = useState(1);

  const [upgradeModal, setUpgradeModal] = useState<{ isOpen: boolean, facility: string, action: 'build' | 'upgrade' | null }>({ isOpen: false, facility: '', action: null });
  const [terrainModal, setTerrainModal] = useState(false);
  const [changeTerrainId, setChangeTerrainId] = useState(1);

  const fetchBase = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) {
      navigate('/');
      return;
    }
    try {
      const res = await fetch('/api/base', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json() as any;
      if (data.success) {
        if (data.exists) {
          setBaseInfo(data.base);
          setFacilities(data.facilities);
          setPendingIncome(data.pendingIncome);
          setPowerRate(data.rate);
          setDefenseSummary(data.defenseSummary);
          setBaseBattleSummary(data.baseBattleSummary);
        } else {
          setBaseInfo(null);
        }
      }
    } catch (err) {
      showToast('基地情報の取得に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBase();
  }, [navigate]);

  const handleCreate = async () => {
    if (!createName.trim()) {
      showToast('基地名を入力してください', 'error');
      return;
    }
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch('/api/base/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name: createName, terrain: createTerrain })
      });
      const data = await res.json() as any;
      if (data.success) {
        showToast(data.message, 'success');
        fetchBase();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('作成に失敗しました', 'error');
    }
  };

  const handleCollect = async () => {
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch('/api/base/collect', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json() as any;
      if (data.success) {
        showToast(data.message, 'success');
        window.dispatchEvent(new Event('gtactics_money_update')); // In case we add this later
        fetchBase();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('回収に失敗しました', 'error');
    }
  };

  const handleAction = async () => {
    if (!upgradeModal.facility || !upgradeModal.action) return;
    const token = localStorage.getItem('gtactics_token');
    const endpoint = upgradeModal.action === 'build' ? '/api/base/facility/build' : '/api/base/facility/upgrade';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ facility: upgradeModal.facility })
      });
      const data = await res.json() as any;
      if (data.success) {
        showToast(data.message, 'success');
        window.dispatchEvent(new Event('gtactics_money_update'));
        setUpgradeModal({ isOpen: false, facility: '', action: null });
        fetchBase();
      } else {
        showToast(data.message, 'error');
        setUpgradeModal({ isOpen: false, facility: '', action: null });
      }
    } catch (err) {
      showToast('通信に失敗しました', 'error');
      setUpgradeModal({ isOpen: false, facility: '', action: null });
    }
  };

  const handleChangeTerrain = async () => {
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch('/api/base/terrain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ terrain: changeTerrainId })
      });
      const data = await res.json() as any;
      if (data.success) {
        showToast(data.message, 'success');
        window.dispatchEvent(new Event('gtactics_money_update'));
        setTerrainModal(false);
        fetchBase();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('地形の変更に失敗しました', 'error');
    }
  };

  const getTerrainName = (id: number) => {
    switch(id) {
      case 1: return '地上';
      case 2: return '水中';
      case 3: return '宇宙';
      case 4: return '空中';
      case 5: return '仮想空間';
      default: return '不明';
    }
  };

  if (loading) {
    return <div className="layout-main" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  if (!baseInfo) {
    return (
      <main className="layout-main">
        <div className="base-container">
          <div className="page-head">
            <div className="base-title">基地設立</div>
          </div>
          <div className="base-form-container">
            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              あなたの部隊の拠点を設立します。後から変更可能です。
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>基地名</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                style={{ width: '100%', padding: '8px', background: 'var(--bg-raised)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
                placeholder="グラナダ第3基地"
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>地形</label>
              <select
                value={createTerrain}
                onChange={(e) => setCreateTerrain(Number(e.target.value))}
                style={{ width: '100%', padding: '8px', background: 'var(--bg-raised)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
              >
                <option value={1}>地上</option>
                <option value={2}>水中</option>
                <option value={3}>宇宙</option>
                <option value={4}>空中</option>
                <option value={5}>仮想空間</option>
              </select>
            </div>
            <button className="submit-btn" style={{ width: '100%' }} onClick={handleCreate}>
              設立する
            </button>
          </div>
        </div>
      </main>
    );
  }

  const facilityLabels: Record<string, string> = {
    power: '発電所',
    dock: '修理ドック',
    turret: '砲台',
    museum: '博物館',
    factory: '工場'
  };

  const getCost = (facility: string, nextLevel: number) => {
    if (facility === 'power') return [0, 500, 2000, 8000, 20000, 50000][nextLevel];
    if (facility === 'dock') return [0, 1000, 3000, 10000, 25000, 60000][nextLevel];
    if (facility === 'turret') return [0, 800, 2500, 8000, 20000, 50000][nextLevel];
    if (facility === 'museum') return [0, 2000, 5000, 15000, 30000, 80000][nextLevel];
    if (facility === 'factory') return [0, 8000, 15000, 30000, 60000, 120000][nextLevel];
    return 0;
  };

  const openUpgradeModal = (facility: string) => {
    const currentLv = facilities[facility] || 0;
    const action = currentLv === 0 ? 'build' : 'upgrade';
    if (currentLv >= 5) {
      showToast('既に最大レベルです', 'error');
      return;
    }
    setUpgradeModal({ isOpen: true, facility, action });
  };

  return (
    <main className="layout-main">
      <div className="base-container">
        <div className="page-head">
          <div>
            <div className="base-title">{baseInfo.name}</div>
            <div className="chip-row">
              <span className="chip cyan" onClick={() => { setChangeTerrainId(baseInfo.terrain); setTerrainModal(true); }} style={{ cursor: 'pointer' }} title="地形を変更する (5000pt)">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}></span>
                {getTerrainName(baseInfo.terrain)} ✎
              </span>
              <span className="chip success">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}></span>
                資金 +{powerRate}pt / 時
              </span>
              {pendingIncome > 0 && (
                <span className="chip" style={{ cursor: 'pointer', background: 'var(--accent-color)', color: '#fff', borderColor: 'var(--accent-color)' }} onClick={handleCollect}>
                  収益を受け取る (+{pendingIncome}pt)
                </span>
              )}
            </div>
          </div>
          <div className="defense-summary-panel">
            {defenseSummary && (
              <>
                {!defenseSummary.hasDefenseBattle ? (
                  <div className="defense-status empty" onClick={() => navigate('/battle')} style={{ cursor: 'pointer' }}>
                    <div className="status-title">個別戦 未設置</div>
                    <div className="status-desc">出撃ページから個別戦を設置してください</div>
                  </div>
                ) : defenseSummary.recentCount === 0 ? (
                  <div className="defense-status safe">
                    <div className="status-title">ALL CLEAR - 異常なし</div>
                    <div className="status-desc">直近24時間の基地への襲撃はありません</div>
                  </div>
                ) : defenseSummary.recentCount === 1 ? (
                  <div className="defense-status alert">
                    <div className="status-title blink">DEFENSE ALERT</div>
                    <div className="status-desc">
                      1件の襲撃がありました（{defenseSummary.winCount}勝 {defenseSummary.loseCount}敗）
                      {defenseSummary.latestHasReplay && (
                        <button className="submit-btn" style={{ marginLeft: '1rem', padding: '4px 12px', fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); navigate(`/replay/${defenseSummary.latestLogId}`); }}>
                          リプレイを見る
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="defense-status alert">
                    <div className="status-title blink">DEFENSE ALERT</div>
                    <div className="status-desc">
                      複数件の襲撃がありました（{defenseSummary.winCount}勝 {defenseSummary.loseCount}敗）
                      <button className="submit-btn" style={{ marginLeft: '1rem', padding: '4px 12px', fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); navigate('/log'); }}>
                        個別戦履歴を見る
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {baseBattleSummary && (
              <div className="defense-status" style={{ marginTop: '1rem', borderColor: baseBattleSummary.shieldRemainingSec > 0 ? 'var(--accent-color)' : 'var(--border-color)', background: baseBattleSummary.shieldRemainingSec > 0 ? 'rgba(79, 172, 254, 0.1)' : 'var(--panel-inset)' }}>
                <div className="status-title" style={{ color: baseBattleSummary.shieldRemainingSec > 0 ? 'var(--accent-color)' : 'inherit' }}>基地戦サマリ</div>
                <div className="status-desc">
                  直近24時間の襲撃: {baseBattleSummary.recentCount}件（{baseBattleSummary.winCount}勝 {baseBattleSummary.loseCount}敗）
                  <br />
                  被害総額: {baseBattleSummary.lootLoss} pt
                  {baseBattleSummary.shieldRemainingSec > 0 && (
                    <><br /><span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>シールド作動中（残り {Math.floor(baseBattleSummary.shieldRemainingSec / 3600)}時間{Math.floor((baseBattleSummary.shieldRemainingSec % 3600) / 60)}分）</span></>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-2)' }}>基地施設</h2>
        
        <div className="facility-grid">
          {/* Power Plant */}
          <div className={`facility-card ${!facilities.power ? 'locked' : ''}`}>
            <div className="facility-head">
              <div className="facility-name">{facilityLabels.power}</div>
              <div className="facility-lv">{facilities.power ? `Lv ${facilities.power}` : '未建設'}</div>
            </div>
            <div className="facility-desc">基地の資金収入を生み出す。<br/>現在: +{powerRate}pt/時</div>
            {facilities.power < 5 && (
              <button className="facility-action" onClick={() => openUpgradeModal('power')}>
                {facilities.power === 0 ? `建設する (${getCost('power', 1)}pt)` : `Lv${facilities.power + 1} へ強化 (${getCost('power', facilities.power + 1)}pt)`}
              </button>
            )}
          </div>

          {/* Repair Dock */}
          <div className={`facility-card ${!facilities.dock ? 'locked' : ''}`}>
            <div className="facility-head">
              <div className="facility-name">{facilityLabels.dock}</div>
              <div className="facility-lv">{facilities.dock ? `Lv ${facilities.dock}` : '未建設'}</div>
            </div>
            <div className="facility-desc">機体の修理費用が割引される。<br/>現在: {facilities.dock * 10}% 引</div>
            {facilities.dock < 5 && (
              <button className="facility-action" onClick={() => openUpgradeModal('dock')}>
                {facilities.dock === 0 ? `建設する (${getCost('dock', 1)}pt)` : `Lv${facilities.dock + 1} へ強化 (${getCost('dock', facilities.dock + 1)}pt)`}
              </button>
            )}
          </div>

          {/* Turret */}
          <div className={`facility-card ${!facilities.turret ? 'locked' : ''}`}>
            <div className="facility-head">
              <div className="facility-name">{facilityLabels.turret}</div>
              <div className="facility-lv">{facilities.turret ? `Lv ${facilities.turret}` : '未建設'}</div>
            </div>
            <div className="facility-desc">基地戦の防衛時、開幕に迎撃射撃を行う。<br/>現在: 迎撃 {[0, 1, 1, 2, 2, 3][facilities.turret]}回 × {[0, 20, 35, 35, 50, 50][facilities.turret]}ダメージ</div>
            {facilities.turret < 5 && (
              <button className="facility-action" onClick={() => openUpgradeModal('turret')}>
                {facilities.turret === 0 ? `建設する (${getCost('turret', 1)}pt)` : `Lv${facilities.turret + 1} へ強化 (${getCost('turret', facilities.turret + 1)}pt)`}
              </button>
            )}
          </div>

          {/* Museum */}
          <div className={`facility-card ${!facilities.museum ? 'locked' : ''}`} onClick={() => facilities.museum > 0 && navigate('/museum')} style={{ cursor: facilities.museum > 0 ? 'pointer' : 'default' }}>
            <div className="facility-head">
              <div className="facility-name">{facilityLabels.museum}</div>
              <div className="facility-lv">{facilities.museum ? `Lv ${facilities.museum}` : '未建設'}</div>
            </div>
            <div className="facility-desc">収集した機体を展示できる。<br/>展示枠: {[0, 4, 8, 12, 18, 24][facilities.museum || 0]}枠</div>
            {facilities.museum < 5 && (
              <button className="facility-action" onClick={(e) => { e.stopPropagation(); openUpgradeModal('museum'); }}>
                {facilities.museum === 0 ? `建設する (${getCost('museum', 1)}pt)` : `Lv${facilities.museum + 1} へ強化 (${getCost('museum', facilities.museum + 1)}pt)`}
              </button>
            )}
          </div>

          {/* Factory */}
          <div className={`facility-card ${!facilities.factory ? 'locked' : ''}`}>
            <div className="facility-head">
              <div className="facility-name">{facilityLabels.factory}</div>
              <div className="facility-lv">{facilities.factory ? `Lv ${facilities.factory}` : '未建設'}</div>
            </div>
            <div className="facility-desc">ショップでの機体購入費用が割引される。<br/>現在: {[0, 2, 5, 8, 12, 15][facilities.factory]}% 引</div>
            {facilities.factory < 5 && (
              <button className="facility-action" onClick={() => openUpgradeModal('factory')}>
                {facilities.factory === 0 ? `建設する (${getCost('factory', 1)}pt)` : `Lv${facilities.factory + 1} へ強化 (${getCost('factory', facilities.factory + 1)}pt)`}
              </button>
            )}
          </div>
        </div>

        <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-2)', marginTop: 'var(--space-4)' }}>機体博物館</h2>
        <div className="museum-placeholder" onClick={() => navigate('/museum')} style={{ cursor: 'pointer', textAlign: 'center', padding: '2rem', background: 'var(--bg-raised)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
          <div style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>展示ホール、図鑑、殿堂の設定はこちらから</div>
          <button className="submit-btn" style={{ padding: '0.5rem 2rem' }}>博物館へ入館</button>
        </div>
      </div>

      <Modal
        open={terrainModal}
        title="基地の地形変更"
        onClose={() => setTerrainModal(false)}
        actions={[
          <button key="cancel" className="text-btn" onClick={() => setTerrainModal(false)}>キャンセル</button>,
          <button key="submit" className="submit-btn" onClick={handleChangeTerrain}>変更する (5000 pt)</button>
        ]}
      >
        <p style={{ marginBottom: '1rem' }}>変更先の地形を選択してください。</p>
        <select
          value={changeTerrainId}
          onChange={(e) => setChangeTerrainId(Number(e.target.value))}
          style={{ width: '100%', padding: '8px', background: 'var(--bg-raised)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
        >
          <option value={1}>地上</option>
          <option value={2}>水中</option>
          <option value={3}>宇宙</option>
          <option value={4}>空中</option>
          <option value={5}>仮想空間</option>
        </select>
      </Modal>

      <Modal
        open={upgradeModal.isOpen}
        title={upgradeModal.action === 'build' ? '施設の建設' : '施設の強化'}
        onClose={() => setUpgradeModal({ isOpen: false, facility: '', action: null })}
        actions={[
          <button key="cancel" className="text-btn" onClick={() => setUpgradeModal({ isOpen: false, facility: '', action: null })}>キャンセル</button>,
          <button key="submit" className="submit-btn" onClick={handleAction}>{upgradeModal.action === 'build' ? '建設する' : '強化する'}</button>
        ]}
      >
        <p style={{ marginBottom: '1rem' }}>
          <strong>{facilityLabels[upgradeModal.facility]}</strong> を 
          {upgradeModal.action === 'build' ? '建設' : `Lv${(facilities[upgradeModal.facility] || 0) + 1}に強化`}しますか？
        </p>
        <div style={{ background: 'var(--panel-inset)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>必要資金</span>
            <span className="cost-text">{getCost(upgradeModal.facility, (facilities[upgradeModal.facility] || 0) + 1).toLocaleString()} pt</span>
          </div>
        </div>
      </Modal>
    </main>
  );
};
