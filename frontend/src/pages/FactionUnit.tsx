import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; // スタイル流用
import { UnitImage } from '../components/UnitImage';

interface FactionUnitData {
  id: number;
  faction_id: number;
  unit_id: number;
  custom_name: string;
  image: string;
  custom_hp: number;
  custom_en: number;
  custom_armor: number;
  custom_mobility: number;
  custom_sensor: number;
  custom_lp: number;
  weapon_id: number;
  item1_id: number;
  item2_id: number;
  base_name: string;
  base_image: string;
  base_hp: number;
  base_en: number;
  base_armor: number;
  base_mobility: number;
  base_sensor: number;
  max_weight: number;
  unit_price: number;
  weapon_name: string | null;
  weapon_weight: number | null;
  item1_name: string | null;
  item1_weight: number | null;
  item2_name: string | null;
  item2_weight: number | null;
}

export const FactionUnit: React.FC = () => {
  const navigate = useNavigate();
  
  const [factionUnit, setFactionUnit] = useState<FactionUnitData | null>(null);
  const [factionFunds, setFactionFunds] = useState<number>(0);
  const [user, setUser] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // フォーム用ステート
  const [buyUnitId, setBuyUnitId] = useState<number>(0);
  const [customStat, setCustomStat] = useState<string>('hp');
  const [renameName, setRenameName] = useState<string>('');
  const [imageName, setImageName] = useState<string>('');
  const [equipSlot, setEquipSlot] = useState<string>('weapon_id');
  const [equipItemId, setEquipItemId] = useState<number>(0);

  useEffect(() => {
    fetchMe();
    fetchFactionUnit();
    fetchUnits();
    fetchItems();
  }, []);

  const fetchMe = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return navigate('/');
    try {
      const response = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) setUser(data.user);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFactionUnit = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const response = await fetch('/api/faction-unit', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setFactionUnit(data.faction_unit);
        setFactionFunds(data.faction_funds);
        if (data.faction_unit) {
          setRenameName(data.faction_unit.custom_name || data.faction_unit.base_name);
          setImageName(data.faction_unit.image || data.faction_unit.base_image);
        }
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('情報の取得に失敗しました');
    }
  };

  const fetchUnits = async () => {
    try {
      const res = await fetch('/api/units');
      const data = (await res.json()) as any;
      if (data.success) setUnits(data.units);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/items');
      const data = (await res.json()) as any;
      if (data.success) setItems(data.items);
    } catch (err) {
      console.error(err);
    }
  };

  const apiPost = async (path: string, body: any) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/faction-unit${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage(data.message);
        fetchFactionUnit();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('操作に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = () => {
    if (buyUnitId === 0) return setError('機体を選択してください');
    apiPost('/buy', { unit_id: buyUnitId });
  };

  const handleCustomize = () => {
    apiPost('/customize', { stat_type: customStat });
  };

  const handleRename = () => {
    apiPost('/rename', { custom_name: renameName });
  };

  const handleImage = () => {
    apiPost('/image', { image: imageName });
  };

  const handleEquip = () => {
    apiPost('/equip', { slot: equipSlot, item_id: equipItemId });
  };

  const isLeader = user?.faction_role === 'leader';
  
  const displayHp = factionUnit ? factionUnit.base_hp + factionUnit.custom_hp : 0;
  const displayEn = factionUnit ? factionUnit.base_en + factionUnit.custom_en : 0;
  const displayArmor = factionUnit ? factionUnit.base_armor + factionUnit.custom_armor : 0;
  const displayMobility = factionUnit ? factionUnit.base_mobility + factionUnit.custom_mobility : 0;
  const displaySensor = factionUnit ? factionUnit.base_sensor + factionUnit.custom_sensor : 0;
  
  const currentWeight = factionUnit ? (factionUnit.weapon_weight || 0) + (factionUnit.item1_weight || 0) + (factionUnit.item2_weight || 0) : 0;
  const maxWeight = factionUnit ? factionUnit.max_weight : 0;

  // バーの長さを計算
  const calcBarWidth = (val: number, max: number) => {
    return Math.min(100, Math.max(0, (val / max) * 100)) + '%';
  };

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>
            ルナツー（勢力機体管理）
          </h1>
          <button onClick={() => navigate(`/faction/${user?.faction_id}`)} className="text-btn">司令室へ戻る</button>
        </div>

        {error && <div className="error-message" style={{marginBottom: '1rem'}}>{error}</div>}
        {message && <div className="success-message" style={{marginBottom: '1rem', color: '#4bc8ff'}}>{message}</div>}

        <div style={{ marginBottom: '1rem', color: '#ecc94b', fontSize: '1.2rem', fontWeight: 'bold' }}>
          現在の勢力ポイント: {factionFunds} G
        </div>

        {!factionUnit && (
          <div style={{ padding: '2rem', background: 'rgba(0,0,0,0.5)', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ color: '#aaa', marginBottom: '1rem' }}>
              勢力機体を保有していません。ポイントを消費して購入してください。<br/>
              ※勢力機体は1勢力につき1機のみ保有できます。
            </div>
            {isLeader ? (
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
                <select className="login-input" style={{ width: '300px' }} value={buyUnitId} onChange={e => setBuyUnitId(Number(e.target.value))}>
                  <option value={0}>機体を選択してください</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.name} (価格: {u.price} G)</option>
                  ))}
                </select>
                <button className="submit-btn" onClick={handleBuy} disabled={loading} style={{ margin: 0, padding: '0.8rem 2rem' }}>
                  勢力機体を購入
                </button>
              </div>
            ) : (
              <div style={{ color: '#ff4b4b' }}>勢力機体の購入はリーダーのみ可能です。</div>
            )}
          </div>
        )}

        {factionUnit && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* ステータス表示部 */}
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <h2 style={{ color: '#00f2fe', margin: '0 0 1rem 0' }}>{factionUnit.custom_name || factionUnit.base_name}</h2>
                <div style={{ width: '100%', height: '240px', background: 'url(/images/luna.gif) bottom center no-repeat', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: '1rem', border: '1px solid #444' }}>
                  {factionUnit.image && <UnitImage file={factionUnit.image} alt="unit" />}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.9rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', background: 'rgba(0,242,254,0.1)' }}>武器</td>
                    <td colSpan={3} style={{ padding: '0.5rem', border: '1px solid #444' }}>{factionUnit.weapon_name || 'なし'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', background: 'rgba(0,242,254,0.1)' }}>装備１</td>
                    <td colSpan={3} style={{ padding: '0.5rem', border: '1px solid #444' }}>{factionUnit.item1_name || 'なし'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', background: 'rgba(0,242,254,0.1)' }}>装備２</td>
                    <td colSpan={3} style={{ padding: '0.5rem', border: '1px solid #444' }}>{factionUnit.item2_name || 'なし'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', background: 'rgba(0,242,254,0.1)', width: '25%' }}>耐久力</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', width: '25%' }}>
                      {displayHp} / {displayHp}<br/>
                      <div style={{ width: '100%', height: '4px', background: '#333', marginTop: '4px' }}>
                        <div style={{ width: '100%', height: '100%', background: '#00f2fe' }}></div>
                      </div>
                    </td>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', background: 'rgba(0,242,254,0.1)', width: '25%' }}>ＥＮ</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', width: '25%' }}>
                      {displayEn} / {displayEn}<br/>
                      <div style={{ width: '100%', height: '4px', background: '#333', marginTop: '4px' }}>
                        <div style={{ width: '100%', height: '100%', background: '#ecc94b' }}></div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', background: 'rgba(0,242,254,0.1)' }}>運動</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #444' }}>
                      {displayMobility}<br/>
                      <div style={{ width: '100%', height: '4px', background: '#333', marginTop: '4px' }}>
                        <div style={{ width: calcBarWidth(displayMobility, 200), height: '100%', background: '#4bff7d' }}></div>
                      </div>
                    </td>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', background: 'rgba(0,242,254,0.1)' }}>索敵</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #444' }}>
                      {displaySensor}<br/>
                      <div style={{ width: '100%', height: '4px', background: '#333', marginTop: '4px' }}>
                        <div style={{ width: calcBarWidth(displaySensor, 200), height: '100%', background: '#4facfe' }}></div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', background: 'rgba(0,242,254,0.1)' }}>装甲</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #444' }}>
                      {displayArmor}<br/>
                      <div style={{ width: '100%', height: '4px', background: '#333', marginTop: '4px' }}>
                        <div style={{ width: calcBarWidth(displayArmor, 200), height: '100%', background: '#ff4b4b' }}></div>
                      </div>
                    </td>
                    <td style={{ padding: '0.5rem', border: '1px solid #444', background: 'rgba(0,242,254,0.1)', whiteSpace: 'nowrap' }}>装備重量</td>
                    <td style={{ padding: '0.5rem', border: '1px solid #444' }}>
                      <span style={{ color: currentWeight > maxWeight ? '#ff4b4b' : '#fff' }}>{currentWeight}</span> / {maxWeight}<br/>
                      <div style={{ width: '100%', height: '4px', background: '#333', marginTop: '4px' }}>
                        <div style={{ width: calcBarWidth(currentWeight, maxWeight), height: '100%', background: currentWeight > maxWeight ? '#ff4b4b' : '#a0aec0' }}></div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* リーダー操作部 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {isLeader ? (
                <>
                  <div style={{ border: '1px solid #ecc94b', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ color: '#ecc94b', margin: '0 0 1rem 0', borderBottom: '1px solid rgba(236,201,75,0.3)', paddingBottom: '0.5rem' }}>機体乗換・購入</h3>
                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '0.5rem' }}>※現在の機体は下取り（定価の70%）に出されます。</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select className="login-input" value={buyUnitId} onChange={e => setBuyUnitId(Number(e.target.value))}>
                        <option value={0}>機体を選択してください</option>
                        {units.map(u => (
                          <option key={u.id} value={u.id}>{u.name} (価格: {u.price} G)</option>
                        ))}
                      </select>
                      <button className="submit-btn" onClick={handleBuy} disabled={loading} style={{ margin: 0, padding: '0 1rem', whiteSpace: 'nowrap' }}>乗換</button>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #4facfe', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ color: '#4facfe', margin: '0 0 1rem 0', borderBottom: '1px solid rgba(79,172,254,0.3)', paddingBottom: '0.5rem' }}>機体カスタマイズ</h3>
                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '0.5rem' }}>※カスタマイズには {factionUnit.unit_price} G（機体価格と同額）必要です。<br/>※100回以降のカスタムは一定確率で失敗し能力が下がります。</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select className="login-input" value={customStat} onChange={e => setCustomStat(e.target.value)}>
                        <option value="hp">耐久力 ＋２０</option>
                        <option value="en">ＥＮ ＋２０</option>
                        <option value="armor">装甲 ＋１</option>
                        <option value="mobility">運動性 ＋２</option>
                        <option value="sensor">索敵 ＋２</option>
                      </select>
                      <button className="submit-btn" onClick={handleCustomize} disabled={loading} style={{ margin: 0, padding: '0 1rem', whiteSpace: 'nowrap' }}>カスタム</button>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #4bff7d', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ color: '#4bff7d', margin: '0 0 1rem 0', borderBottom: '1px solid rgba(75,255,125,0.3)', paddingBottom: '0.5rem' }}>武器・装備搭載</h3>
                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '0.5rem' }}>※アイテム価格分の勢力ポイントを消費します。</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select className="login-input" value={equipSlot} onChange={e => setEquipSlot(e.target.value)} style={{ width: '120px' }}>
                        <option value="weapon_id">武器</option>
                        <option value="item1_id">装備１</option>
                        <option value="item2_id">装備２</option>
                      </select>
                      <select className="login-input" value={equipItemId} onChange={e => setEquipItemId(Number(e.target.value))}>
                        <option value={0}>装備を外す</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name} (価格:{i.price}G 重量:{i.weight})</option>
                        ))}
                      </select>
                      <button className="submit-btn" onClick={handleEquip} disabled={loading} style={{ margin: 0, padding: '0 1rem', whiteSpace: 'nowrap' }}>搭載</button>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #555', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ color: '#aaa', margin: '0 0 1rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>名称・画像変更</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                      <input type="text" className="login-input" value={renameName} onChange={e => setRenameName(e.target.value)} placeholder="機体名称" />
                      <button className="submit-btn" onClick={handleRename} disabled={loading} style={{ margin: 0, padding: '0 1rem', whiteSpace: 'nowrap', background: '#555' }}>名称変更</button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="text" className="login-input" value={imageName} onChange={e => setImageName(e.target.value)} placeholder="画像URL (例: gm.png)" />
                      <button className="submit-btn" onClick={handleImage} disabled={loading} style={{ margin: 0, padding: '0 1rem', whiteSpace: 'nowrap', background: '#555' }}>画像変更</button>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: '2rem', background: 'rgba(255,0,0,0.1)', border: '1px solid #ff4b4b', borderRadius: '8px', color: '#ff4b4b', textAlign: 'center' }}>
                  勢力機体の操作（購入・カスタム・装備変更など）は<br/>リーダーのみ実行可能です。
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
