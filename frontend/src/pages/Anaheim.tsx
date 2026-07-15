import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css';

// P43-B1: 原作 ＡＥ月面工場（manual/images/t_anahim.jpg）準拠の一枚画面。
// 処理は anahaim_act.cgi 準拠の既存API（/api/anaheim/*, /api/buy_unit ほか）を使う。

interface Unit {
  id: number;
  name: string;
  hp: number;
  en: number;
  armor: number;
  mobility: number;
  sensor: number;
  image: string;
  price: number;
  req_fame: number;
  description?: string;
  unit_lv: number;
  max_weight: number;
}

interface Item {
  id: number;
  name: string;
  description: string;
  item_type: number;
  power: number;
  ammo: number;
  en_cost: number;
  weight: number;
  price: number;
  range_short: number;
  range_mid: number;
  range_long: number;
  hit_count: number;
  req_level: number;
}

interface User {
  id: string;
  money: number;
  level: number;
  unit_id: number;
  unit_custom_hp: number;
  unit_custom_en: number;
  unit_custom_armor: number;
  unit_custom_mobility: number;
  unit_custom_sensor: number;
  unit_custom_lp: number;
  max_weight: number;
  current_weight: number;
  fame: number;
  chara_name: string;
  unit_image: string;
  unit_custom_name: string;
  unit_name: string;
  unit_description: string;
  weapon_name: string;
  item1_name: string;
  current_hp: number;
  max_hp: number;
  current_en: number;
  max_en: number;
  remaining_customs: number;
}

export const Anaheim: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transformTargets, setTransformTargets] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [astonajiMessage, setAstonajiMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [showWeapons, setShowWeapons] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [showUnitDesc, setShowUnitDesc] = useState(false);

  const [unitSearch, setUnitSearch] = useState('');
  const [selectedBuyUnitId, setSelectedBuyUnitId] = useState<number | ''>('');
  const [confirmBuyOpen, setConfirmBuyOpen] = useState(false);

  const [renameTemplateId, setRenameTemplateId] = useState<number>(1);
  const [customizeTarget, setCustomizeTarget] = useState<number>(1);
  const [custom2M, setCustom2M] = useState<number>(1);
  const [custom2S, setCustom2S] = useState<number>(2);

  const [updateChampion, setUpdateChampion] = useState(false);
  const [isChampion, setIsChampion] = useState(false);
  const [inventory, setInventory] = useState<any[]>([]);
  const [selectedEquipSlot, setSelectedEquipSlot] = useState<string>('weapon_id');
  const [selectedInventoryId, setSelectedInventoryId] = useState<number | ''>('');


  const token = () => localStorage.getItem('gtactics_token');

  const fetchData = async () => {
    try {
      const t = token();
      if (!t) { navigate('/'); return; }
      const auth = { 'Authorization': `Bearer ${t}` };

      const [meRes, uRes, iRes, tRes, champRes, invRes] = await Promise.all([
        fetch('/api/me', { headers: auth }),
        fetch('/api/units'),
        fetch('/api/items'),
        fetch('/api/hangar/transform_targets', { headers: auth }),
        fetch('/api/champion', { headers: auth }),
        fetch('/api/inventory', { headers: auth })
      ]);
      const meData = await meRes.json() as any;
      const uData = await uRes.json() as any;
      const iData = await iRes.json() as any;
      const tData = await tRes.json() as any;
      const champData = await champRes.json() as any;
      const invData = await invRes.json() as any;

      if (!meData.success) { navigate('/'); return; }
      const u = meData.user;
      setUser({
        id: u.id,
        money: u.money,
        level: u.level || 1,
        unit_id: u.unit_id,
        unit_custom_hp: u.unit_custom_hp,
        unit_custom_en: u.unit_custom_en,
        unit_custom_armor: u.unit_custom_armor,
        unit_custom_mobility: u.unit_custom_mobility,
        unit_custom_sensor: u.unit_custom_sensor,
        unit_custom_lp: u.unit_custom_lp || 0,
        max_weight: u.max_weight || 0,
        current_weight: u.current_weight || 0,
        fame: u.fame || 0,
        chara_name: u.chara_name,
        unit_image: u.unit_image || '',
        unit_custom_name: u.unit_custom_name || '',
        unit_name: u.unit_name || '',
        unit_description: u.unit_description || '',
        weapon_name: u.weapon_name || '',
        item1_name: u.item1_name || '',
        current_hp: u.current_hp,
        max_hp: u.max_hp,
        current_en: u.current_en,
        max_en: u.max_en,
        remaining_customs: u.remaining_customs ?? 0,
      });
      setAstonajiMessage(prev => prev || `よう、${u.chara_name}じゃないか。何の用だい？`);
      if (uData.success) setUnits(uData.units);
      if (iData.success) setItems(iData.items);
      if (tData.success) setTransformTargets(tData.targets);
      if (invData.success) setInventory(invData.inventory);

      const myId = u.id;
      const indChamp = champData.individual?.champion_id;
      const teamChamp = champData.team?.champion_id;
      if (myId && (myId === indChamp || myId === teamChamp || champData.is_defender === true)) {
        setIsChampion(true);
      }
    } catch (err) {
      setError('データの取得に失敗しました');
    }
  };

  useEffect(() => { fetchData(); }, []);

  // アクション実行の共通処理（成功時は astonaji＋結果文を吹き出しへ）
  const postAction = async (url: string, body: any, fallbackQuote: string) => {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json() as any;
      if (data.success) {
        setAstonajiMessage(data.astonaji || fallbackQuote);
        setMessage(data.message || '');
        fetchData();
      } else {
        setError(data.message);
      }
      return data;
    } catch (err) {
      setError('通信エラーが発生しました');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleBuyUnit = async () => {
    if (selectedBuyUnitId === '') return;
    setConfirmBuyOpen(false);
    const data = await postAction('/api/buy_unit', { unit_id: Number(selectedBuyUnitId) }, 'まいどあり！');
    if (data?.success) setSelectedBuyUnitId('');
  };

  const handleBuyItem = (itemId: number) =>
    postAction('/api/buy_item', { item_id: itemId }, 'まいどあり！');

  const handleRename = async () => {
    const data = await postAction('/api/anaheim/rename', { template_id: renameTemplateId }, '');
    if (data?.success) setAstonajiMessage(`おう！いい名前だな。今日からこいつは ${data.new_unit_name} だぜ！`);
  };

  const handleCustomize = () =>
    postAction('/api/anaheim/customize', { target_stat: customizeTarget, update_champion: updateChampion }, '');

  const handleCustomize2 = () =>
    postAction('/api/anaheim/customize_2', { noryoku_m: custom2M, noryoku_s: custom2S, update_champion: updateChampion }, '');

  const handleTransform = (targetUnitId: number) =>
    postAction('/api/hangar/transform', { target_unit_id: targetUnitId, update_champion: updateChampion }, '変形完了だ！');

  const handleEquip = () => {
    if (selectedInventoryId === '') return;
    const invId = selectedInventoryId === 0 ? null : selectedInventoryId;
    postAction('/api/equip', { inventory_id: invId, slot: selectedEquipSlot, update_champion: updateChampion }, '装備完了だぜ！');
  };

  const filteredUnits = useMemo(() => {
    const list = units.filter(u => u.id !== 9999 && u.name.toLowerCase().includes(unitSearch.toLowerCase()));
    // 原作 tensyoku の charareset: キャラクターリセットも購入セレクトに並ぶ
    list.push({
      id: 9999, name: 'キャラクターリセット', price: 0, req_fame: 0,
      hp: 0, en: 0, armor: 0, mobility: 0, sensor: 0, image: '', unit_lv: 0, max_weight: 0,
    });
    return list;
  }, [units, unitSearch]);

  if (!user) return <div className="register-container" style={{ padding: '2rem 1rem' }}><div className="glass-panel" style={{ textAlign: 'center' }}>LOADING...</div></div>;

  const currentUnit = units.find(u => u.id === user.unit_id);
  const unitPrice = currentUnit?.price || 0;
  // 安全カスタム残回数はサーバー（/api/me）が投影層 customizeSafeThreshold で算出。
  // フロントは表示するだけ（特性名の生読み・閾値式の二重実装を撤去）。
  const remainingCustoms = user.remaining_customs;

  const custom2Stats = [
    { id: 1, name: '耐久力', dec: '-5', inc: '+5' },
    { id: 2, name: 'ＥＮ', dec: '-5', inc: '+5' },
    { id: 3, name: '装甲', dec: '-2', inc: '+2' },
    { id: 4, name: '運動性', dec: '-3', inc: '+3' },
    { id: 5, name: '索敵', dec: '-3', inc: '+3' },
    { id: 6, name: '装備可能重量', dec: '-1', inc: '+1' },
  ];

  const cellLabel: React.CSSProperties = { background: '#333', color: '#fff', padding: '0.25rem 0.5rem', fontSize: '0.85rem', whiteSpace: 'nowrap' };
  const cellValue: React.CSSProperties = { background: '#111', color: '#fff', padding: '0.25rem 0.5rem', fontSize: '0.9rem' };
  const catalogBtn: React.CSSProperties = { background: '#ccc', color: '#000', border: '1px solid #fff', padding: '0.2rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' };
  const selectStyle: React.CSSProperties = { background: '#111', color: '#fff', border: '1px solid #555', padding: '0.4rem' };
  const actionBtn: React.CSSProperties = { background: '#ccc', color: '#000', border: '1px solid #fff', padding: '0.4rem 1rem', cursor: 'pointer', fontWeight: 'bold' };

  const renderItemTable = (filterTypes: number[], title: string) => {
    // 原作 manual_weapon/item: 搭載可能なもののみ表示（重量・req_level）
    const list = items.filter(i => {
      const matchesType = filterTypes.length > 0 ? filterTypes.includes(i.item_type) : ![1, 2, 3, 4, 5].includes(i.item_type);
      return matchesType && i.weight <= user.max_weight && i.req_level <= user.level;
    });
    return (
      <div style={{ margin: '1rem 0', background: 'rgba(0,0,0,0.4)', padding: '1rem', border: '1px solid #4bc8ff', borderRadius: '4px' }}>
        <h3 style={{ color: '#4bc8ff', marginBottom: '0.5rem' }}>{title}</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.1)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>名称</th>
                <th style={{ padding: '0.5rem' }}>威力</th>
                <th style={{ padding: '0.5rem' }}>弾数</th>
                <th style={{ padding: '0.5rem' }}>EN消費</th>
                <th style={{ padding: '0.5rem' }}>重量</th>
                <th style={{ padding: '0.5rem' }}>射程</th>
                <th style={{ padding: '0.5rem' }}>Hit数</th>
                <th style={{ padding: '0.5rem' }}>価格 (G)</th>
                <th style={{ padding: '0.5rem', textAlign: 'center' }}>購入</th>
              </tr>
            </thead>
            <tbody>
              {list.map(item => {
                const rangeStr = [item.range_short ? '近' : '', item.range_mid ? '中' : '', item.range_long ? '遠' : ''].filter(Boolean).join('/');
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ fontWeight: 'bold', color: '#4bc8ff' }}>{item.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#aaa' }}>{item.description}</div>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#ff6b6b' }}>{item.power}</td>
                    <td style={{ padding: '0.5rem', color: '#4bff7d' }}>{item.ammo}</td>
                    <td style={{ padding: '0.5rem', color: '#e0c3fc' }}>{item.en_cost}</td>
                    <td style={{ padding: '0.5rem', color: '#aaa' }}>{item.weight}</td>
                    <td style={{ padding: '0.5rem', color: '#90cdf4' }}>{rangeStr || '-'}</td>
                    <td style={{ padding: '0.5rem', color: '#f6ad55' }}>{item.hit_count > 0 ? item.hit_count : '-'}</td>
                    <td style={{ padding: '0.5rem', color: '#ffb347' }}>{item.price}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <button
                        onClick={() => handleBuyItem(item.id)}
                        disabled={loading || user.money < item.price}
                        style={{
                          padding: '0.3rem 0.6rem', fontSize: '0.8rem', borderRadius: '4px',
                          background: user.money >= item.price ? 'rgba(75, 255, 125, 0.2)' : 'rgba(255,255,255,0.1)',
                          border: `1px solid ${user.money >= item.price ? '#4bff7d' : '#888'}`,
                          color: user.money >= item.price ? '#4bff7d' : '#888',
                          cursor: user.money >= item.price ? 'pointer' : 'not-allowed',
                        }}
                      >
                        購入
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const selectedUnit = filteredUnits.find(u => u.id === Number(selectedBuyUnitId));

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '900px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', margin: 0 }}>ＡＥ月面工場</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn">マイページへ</button>
        </div>

        {/* 1. 機体データパネル（t_anahim.jpg 上部） */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ width: '180px', minHeight: '160px', background: 'rgba(255,255,255,0.05)', border: '1px solid #555', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {user.unit_image
              ? <img src={`/images/units/${user.unit_image}`} alt={user.unit_name} style={{ maxWidth: '100%', maxHeight: '160px' }} />
              : <span style={{ color: '#666', fontSize: '0.8rem' }}>No Image</span>}
          </div>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '2px', marginBottom: '2px' }}>
              <div style={cellLabel}>ユニット</div>
              <div style={cellValue}>{user.unit_custom_name || user.unit_name || '搭乗機なし'}</div>
              <button style={catalogBtn} onClick={() => setShowUnitDesc(true)}>機体解説</button>
              <div style={cellLabel}>武器</div>
              <div style={cellValue}>{user.weapon_name || 'なし'}</div>
              <button style={catalogBtn} onClick={() => { setShowWeapons(v => !v); setShowItems(false); }}>武器目録</button>
              <div style={cellLabel}>装備</div>
              <div style={cellValue}>{user.item1_name || 'なし'}</div>
              <button style={catalogBtn} onClick={() => { setShowItems(v => !v); setShowWeapons(false); }}>装備目録</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '2px' }}>
              <div style={cellLabel}>耐久力</div>
              <div style={cellValue}>{user.current_hp}/{user.max_hp}</div>
              <div style={cellLabel}>ＥＮ</div>
              <div style={cellValue}>{user.current_en}/{user.max_en}</div>
              <div style={cellLabel}>運動</div>
              <div style={cellValue}>{user.unit_custom_mobility}</div>
              <div style={cellLabel}>索敵</div>
              <div style={cellValue}>{user.unit_custom_sensor}</div>
              <div style={cellLabel}>装甲</div>
              <div style={cellValue}>{user.unit_custom_armor}</div>
              <div style={cellLabel}>装備重量</div>
              <div style={cellValue}>{user.current_weight}/{user.max_weight}</div>
            </div>
          </div>
        </div>

        {/* 2. 所持情報行 */}
        <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem', color: '#fff', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div>現在のポイント：<span style={{ color: '#4facfe', fontWeight: 'bold' }}>{user.money}</span></div>
          <div>熟練度：<span style={{ color: '#4bff7d' }}>{user.level}</span></div>
          <div>名声：<span style={{ color: '#ffb347' }}>{user.fame}</span></div>
          <div>カスタム数：<span style={{ color: '#e0c3fc' }}>{user.unit_custom_lp}</span></div>
        </div>

        {/* 目録トグル */}
        {showWeapons && renderItemTable([1, 2, 3, 4, 5], '武器目録')}
        {showItems && renderItemTable([], '装備目録')}

        {/* 3. アストナージ */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', margin: '1rem 0', padding: '0.8rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
          <div style={{ width: '64px', height: '64px', background: '#fff', border: '1px solid #aaa', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
            <img src="/images/astnarge.gif" alt="アストナージ" style={{ maxWidth: '100%', maxHeight: '100%' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '0.3rem' }}>アストナージ</div>
            <div style={{ color: '#fff', fontWeight: 'bold' }}>「{astonajiMessage}」</div>
            {message && <div style={{ color: '#4bff7d', fontSize: '0.9rem', whiteSpace: 'pre-line', marginTop: '0.4rem' }}>{message}</div>}
            {error && <div style={{ color: '#ff6b6b', fontSize: '0.9rem', marginTop: '0.4rem' }}>{error}</div>}
          </div>
        </div>

        {isChampion && (
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
            <input type="checkbox" id="updateChampion" checked={updateChampion} onChange={(e) => setUpdateChampion(e.target.checked)} />
            <label htmlFor="updateChampion" style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 'bold' }}>カスタム/乗換/装備/変形時、優勝/防衛データへ反映する</label>
          </div>
        )}

        {/* 装備変更 */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ color: '#fff', marginBottom: '0.5rem' }}>
            「持ってる武器やアイテムを装備するかい？」
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={selectedEquipSlot} onChange={e => setSelectedEquipSlot(e.target.value)} style={selectStyle}>
              <option value="weapon_id">武器</option>
              <option value="item1_id">装備1</option>
              <option value="item2_id">装備2</option>
            </select>
            <select value={selectedInventoryId} onChange={e => setSelectedInventoryId(e.target.value === '' ? '' : Number(e.target.value))} style={{ ...selectStyle, minWidth: '200px' }}>
              <option value="">選択して下さい</option>
              <option value={0}>【外す】</option>
              {inventory.map((inv: any) => (
                <option key={inv.inventory_id} value={inv.inventory_id}>
                  {inv.name} (重量: {inv.weight})
                </option>
              ))}
            </select>
            <button style={actionBtn} disabled={loading || selectedInventoryId === ''} onClick={handleEquip}>装備する</button>
          </div>
        </div>

        {/* 4. 機体購入 */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="機体名に含まれる文字列を入力"
              value={unitSearch}
              onChange={e => setUnitSearch(e.target.value)}
              style={{ ...selectStyle, flex: 1, minWidth: '200px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={selectedBuyUnitId} onChange={e => setSelectedBuyUnitId(e.target.value === '' ? '' : Number(e.target.value))} style={{ ...selectStyle, minWidth: '280px' }}>
              <option value="">選択して下さい</option>
              {filteredUnits.map(u => (
                <option key={u.id} value={u.id}>
                  {u.id === 9999 ? u.name : `${u.name}（${u.price}pt / 名声${u.req_fame}）`}
                </option>
              ))}
            </select>
            <button style={actionBtn} disabled={loading || selectedBuyUnitId === ''} onClick={() => setConfirmBuyOpen(true)}>機体を変更する</button>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#ff6b6b', marginTop: '0.3rem' }}>
            ※キャラクターリセットを選ぶとキャラクターを初期化、削除できます
          </div>
        </div>

        {/* 5. 機体名称変更（senyou: 名声10消費） */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ color: '#fff', marginBottom: '0.5rem' }}>
            「ところで、お前の機体の名前を変えるかい？　な～に、ちょいと{user.chara_name}の顔を利かせてくれりゃ、すぐにできるぜ」
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={renameTemplateId} onChange={e => setRenameTemplateId(Number(e.target.value))} style={{ ...selectStyle, minWidth: '280px' }}>
              <option value={1}>{user.chara_name}専用 機体名</option>
              <option value={2}>機体名 {user.chara_name}専用</option>
              <option value={3}>{user.chara_name}用 機体名</option>
              <option value={4}>機体名 {user.chara_name}カスタム</option>
              <option value={5}>機体名 {user.chara_name}チューン</option>
              <option value={6}>{user.chara_name}仕様 機体名</option>
              <option value={7}>機体名 {user.chara_name}仕様</option>
              <option value={8}>機体名 {user.chara_name}(Lv)</option>
              <option value={9}>機体名 {user.chara_name} ＳＰ</option>
              <option value={10}>{user.chara_name} 機体名</option>
              <option value={11}>機体名 {user.chara_name}</option>
            </select>
            <button style={actionBtn} disabled={loading || user.fame < 10} onClick={handleRename}>機体名称変更</button>
            <span style={{ fontSize: '0.85rem', color: '#aaa' }}>（名声を10ポイント使用）</span>
          </div>
        </div>

        {/* 6. カスタマイズ（custmaise: 費用=機体価格、安全カスタム残回数表示） */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ color: '#fff', marginBottom: '0.3rem' }}>
            「なんだったら、お前の機体をカスタマイズするかい？　そのためにはポイントが{unitPrice}ほど必要だけどな」
          </div>
          <div style={{ color: '#fff', marginBottom: '0.5rem' }}>
            「この俺なら、あと{remainingCustoms}箇所くらいはカスタマイズできるぜ」
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={customizeTarget} onChange={e => setCustomizeTarget(Number(e.target.value))} style={{ ...selectStyle, minWidth: '200px' }}>
              <option value={1}>耐久力 (+10)</option>
              <option value={2}>ＥＮ (+10)</option>
              <option value={3}>装甲 (+2)</option>
              <option value={4}>運動性 (+5)</option>
              <option value={5}>索敵 (+5)</option>
            </select>
            <button style={actionBtn} disabled={loading || user.money < unitPrice || user.unit_id === 0} onClick={handleCustomize}>カスタマイズ</button>
          </div>
        </div>

        {/* 7. 置き換えカスタマイズ（custmaise_2） */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={custom2M} onChange={e => setCustom2M(Number(e.target.value))} style={selectStyle}>
              {custom2Stats.map(s => <option key={s.id} value={s.id}>{s.name} ({s.dec})</option>)}
            </select>
            <span style={{ color: '#fff' }}>を減らして</span>
            <select value={custom2S} onChange={e => setCustom2S(Number(e.target.value))} style={selectStyle}>
              {custom2Stats.map(s => <option key={s.id} value={s.id}>{s.name} ({s.inc})</option>)}
            </select>
            <span style={{ color: '#fff' }}>を強化する</span>
            <button style={actionBtn} disabled={loading || user.money < unitPrice || user.unit_id === 0} onClick={handleCustomize2}>カスタマイズ</button>
          </div>
        </div>

        {/* 8. 変形（最下部・変形先があるときのみ） */}
        {transformTargets.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '0.8rem' }}>
            <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem' }}>機体変形</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {transformTargets.map((t: any, i: number) => (
                <button key={i} style={actionBtn} disabled={loading || user.money < t.cost}
                  onClick={() => handleTransform(t.unit_id)}>
                  変形（{t.name} / {t.cost}G）
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 機体解説モーダル */}
      {showUnitDesc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setShowUnitDesc(false)}>
          <div className="glass-panel" style={{ maxWidth: '500px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h2 className="cyber-title" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>{user.unit_custom_name || user.unit_name}</h2>
            <p style={{ color: '#fff', whiteSpace: 'pre-line' }}>{user.unit_description || '解説はありません。'}</p>
            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button className="text-btn" onClick={() => setShowUnitDesc(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 購入確認モーダル */}
      {confirmBuyOpen && selectedUnit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            {selectedUnit.id === 9999 ? (
              <>
                <h2 className="cyber-title" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#ff6b6b' }}>キャラクターリセット</h2>
                <p style={{ color: '#fff', marginBottom: '1rem' }}>
                  本当にキャラクターをリセットしますか？<br />
                  <span style={{ color: '#ff4b4b', fontSize: '0.9rem' }}>能力・所持金・機体が初期化されます。復旧はできません。</span>
                </p>
              </>
            ) : (
              <>
                <h2 className="cyber-title" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>機体変更の確認</h2>
                <p style={{ color: '#fff', marginBottom: '1rem' }}>
                  {selectedUnit.name} を {selectedUnit.price}pt で購入し、搭乗しますか？<br />
                  <span style={{ color: '#ff4b4b', fontSize: '0.9rem' }}>※現在の機体は格納庫に保管されます</span>
                </p>
              </>
            )}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="submit-btn" onClick={handleBuyUnit} style={{ flex: 1 }}>YES</button>
              <button className="submit-btn" onClick={() => setConfirmBuyOpen(false)} style={{ flex: 1, background: 'transparent', border: '1px solid #aaa', color: '#aaa' }}>NO</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
