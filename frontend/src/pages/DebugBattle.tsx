import React, { useState } from 'react';
import { BattleAnimation, type BattleEvent, type BattleMeta } from '../components/BattleAnimation';
import './Register.css'; // 再利用

const ABILITY_OPTIONS = [
  { id: '3', label: 'EXAM' },
  { id: '-43', label: 'ゼロシステム' },
  { id: '7', label: 'Iフィールド' },
  { id: '12', label: 'ALICE' },
  { id: '-39', label: 'フェイズシフト' },
  { id: '-40', label: 'ミラージュコロイド' },
  { id: '-34', label: 'アクティブクローク' },
  { id: '-3', label: 'ビームバリア' },
  { id: '8', label: 'リフレクターシールド' },
  { id: '11', label: 'ビームコーティング' },
  { id: '-30', label: 'ABCマント' },
  { id: '-36', label: 'ダミーバルーン' },
  { id: '-44', label: 'DG細胞' },
  { id: '-45', label: '攻撃反射' },
  { id: '-47', label: '牽制効果' },
  { id: '-48', label: '麻痺効果' },
  { id: '24', label: 'ファンネル' },
  { id: 'NT_D', label: 'NT-D' },
];

type CustomWeapon = {
  name: string;
  power: number;
  isBeam: boolean;
};

export const DebugBattle: React.FC = () => {
  const [attackerState, setAttackerState] = useState({
    handle_name: 'アムロ',
    unit_name: 'テスト攻撃機',
    unit_base_hp: 100,
    unit_base_en: 100,
    mobility: 20,
    unit_sensor: 100,
    unit_tokusyu: ''
  });
  const [defenderState, setDefenderState] = useState({
    handle_name: 'シャア',
    unit_name: 'テスト防御機',
    unit_base_hp: 100,
    unit_base_en: 100,
    mobility: 20,
    unit_sensor: 100,
    unit_tokusyu: ''
  });

  const [attackerWeapon, setAttackerWeapon] = useState<CustomWeapon>({ name: 'ビームライフル', power: 45, isBeam: true });
  const [defenderWeapon, setDefenderWeapon] = useState<CustomWeapon>({ name: 'ザクマシンガン', power: 20, isBeam: false });

  const [attackerTokusyu, setAttackerTokusyu] = useState<string[]>(['NT_D']);
  const [defenderTokusyu, setDefenderTokusyu] = useState<string[]>(['24', '-44']);

  const [battleData, setBattleData] = useState<{ events: BattleEvent[], meta: BattleMeta } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAttackerChange = (key: string, value: any) => setAttackerState({ ...attackerState, [key]: value });
  const handleDefenderChange = (key: string, value: any) => setDefenderState({ ...defenderState, [key]: value });

  const handleSimulate = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        attacker: { ...attackerState, unit_tokusyu: attackerTokusyu.join(',') },
        defender: { ...defenderState, unit_tokusyu: defenderTokusyu.join(',') },
        attackerWeapon,
        defenderWeapon
      };

      const response = await fetch('/api/battle/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setBattleData({ events: data.events, meta: data.meta });
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('シミュレーションに失敗しました。');
    }
    setLoading(false);
  };

  if (battleData) {
    return <BattleAnimation events={battleData.events} meta={battleData.meta} onClose={() => setBattleData(null)} />;
  }

  const toggleAbility = (setter: React.Dispatch<React.SetStateAction<string[]>>, current: string[], id: string) => {
    if (current.includes(id)) {
      setter(current.filter(x => x !== id));
    } else {
      setter([...current, id]);
    }
  };

  return (
    <div className="register-container" style={{ maxWidth: '1000px' }}>
      <h2>バトルデバッグシミュレーター</h2>
      <p style={{ color: '#aaa', fontSize: '12px' }}>
        ※ チェックボックスで特殊能力を選択してシミュレーションを実行できます。
      </p>

      {error && <div className="error-message">{error}</div>}

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div data-testid="attacker-section" style={{ flex: 1, minWidth: '300px' }}>
          <h3 style={{ color: '#00d2ff' }}>攻撃側</h3>
          <div className="form-group">
            <label>パイロット名</label>
            <input type="text" value={attackerState.handle_name} onChange={e => handleAttackerChange('handle_name', e.target.value)} />
          </div>
          <div className="form-group">
            <label>機体名</label>
            <input type="text" value={attackerState.unit_name} onChange={e => handleAttackerChange('unit_name', e.target.value)} />
          </div>
          <div className="form-group">
            <label>HP</label>
            <input type="number" value={attackerState.unit_base_hp} onChange={e => handleAttackerChange('unit_base_hp', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label>EN</label>
            <input type="number" value={attackerState.unit_base_en} onChange={e => handleAttackerChange('unit_base_en', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label>運動性</label>
            <input type="number" value={attackerState.mobility} onChange={e => handleAttackerChange('mobility', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label>センサー</label>
            <input type="number" value={attackerState.unit_sensor} onChange={e => handleAttackerChange('unit_sensor', parseInt(e.target.value))} />
          </div>

          <div style={{ marginTop: '20px' }}>
            <h4 style={{ color: '#aaa', marginBottom: '10px' }}>装備武器</h4>
            <div className="form-group" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input type="text" placeholder="武器名" value={attackerWeapon.name} onChange={e => setAttackerWeapon({...attackerWeapon, name: e.target.value})} style={{ flex: 2 }} />
              <input type="number" placeholder="威力" value={attackerWeapon.power} onChange={e => setAttackerWeapon({...attackerWeapon, power: parseInt(e.target.value) || 0})} style={{ flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={attackerWeapon.isBeam} onChange={e => setAttackerWeapon({...attackerWeapon, isBeam: e.target.checked})} />
                ビーム属性
              </label>
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <h4 style={{ color: '#aaa', marginBottom: '10px' }}>特殊能力 (複数選択可)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px' }}>
              {ABILITY_OPTIONS.map(opt => (
                <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={attackerTokusyu.includes(opt.id)} 
                    onChange={() => toggleAbility(setAttackerTokusyu, attackerTokusyu, opt.id)} 
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div data-testid="defender-section" style={{ flex: 1, minWidth: '300px' }}>
          <h3 style={{ color: '#ff0055' }}>防御側</h3>
          <div className="form-group">
            <label>パイロット名</label>
            <input type="text" value={defenderState.handle_name} onChange={e => handleDefenderChange('handle_name', e.target.value)} />
          </div>
          <div className="form-group">
            <label>機体名</label>
            <input type="text" value={defenderState.unit_name} onChange={e => handleDefenderChange('unit_name', e.target.value)} />
          </div>
          <div className="form-group">
            <label>HP</label>
            <input type="number" value={defenderState.unit_base_hp} onChange={e => handleDefenderChange('unit_base_hp', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label>EN</label>
            <input type="number" value={defenderState.unit_base_en} onChange={e => handleDefenderChange('unit_base_en', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label>運動性</label>
            <input type="number" value={defenderState.mobility} onChange={e => handleDefenderChange('mobility', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label>センサー</label>
            <input type="number" value={defenderState.unit_sensor} onChange={e => handleDefenderChange('unit_sensor', parseInt(e.target.value))} />
          </div>

          <div style={{ marginTop: '20px' }}>
            <h4 style={{ color: '#aaa', marginBottom: '10px' }}>装備武器</h4>
            <div className="form-group" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input type="text" placeholder="武器名" value={defenderWeapon.name} onChange={e => setDefenderWeapon({...defenderWeapon, name: e.target.value})} style={{ flex: 2 }} />
              <input type="number" placeholder="威力" value={defenderWeapon.power} onChange={e => setDefenderWeapon({...defenderWeapon, power: parseInt(e.target.value) || 0})} style={{ flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={defenderWeapon.isBeam} onChange={e => setDefenderWeapon({...defenderWeapon, isBeam: e.target.checked})} />
                ビーム属性
              </label>
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <h4 style={{ color: '#aaa', marginBottom: '10px' }}>特殊能力 (複数選択可)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px' }}>
              {ABILITY_OPTIONS.map(opt => (
                <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={defenderTokusyu.includes(opt.id)} 
                    onChange={() => toggleAbility(setDefenderTokusyu, defenderTokusyu, opt.id)} 
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button className="register-button" onClick={handleSimulate} disabled={loading} style={{ marginTop: '20px' }}>
        {loading ? 'シミュレーション中...' : 'アニメーション再生'}
      </button>
    </div>
  );
};
