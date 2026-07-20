import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
import './Register.css';
import { UnitImage } from '../components/UnitImage';

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

  // P43-B2: 1枚縦積みだと「何をする画面か」が読めないので、目的別の3タブに分ける。
  //   equip  = 武器・装備（装備変更 / 目録からの購入）
  //   unit   = 機体（乗り換え購入 / 名称変更 / 変形 / リセット）
  //   custom = カスタマイズ（強化 / 置き換え）
  const [tab, setTab] = useState<'equip' | 'unit' | 'custom'>('equip');

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

  const renderItemTable = (filterTypes: number[], title: string) => {
    // 原作 manual_weapon/item: 搭載可能なもののみ表示（重量・req_level）
    const list = items.filter(i => {
      const matchesType = filterTypes.length > 0 ? filterTypes.includes(i.item_type) : ![1, 2, 3, 4, 5].includes(i.item_type);
      return matchesType && i.weight <= user.max_weight && i.req_level <= user.level;
    });
    return (
      <div className="inset-panel" style={{ margin: '1rem 0' }}>
        <h3 className="sec-title">{title}</h3>
        <div className="scroll-x">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)', textAlign: 'left', color: 'var(--text-secondary)' }}>
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
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--accent-cyan)' }}>{item.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.description}</div>
                    </td>
                    <td style={{ padding: '0.5rem' }}>{item.power}</td>
                    <td style={{ padding: '0.5rem' }}>{item.ammo}</td>
                    <td style={{ padding: '0.5rem' }}>{item.en_cost}</td>
                    <td style={{ padding: '0.5rem' }}>{item.weight}</td>
                    <td style={{ padding: '0.5rem' }}>{rangeStr || '-'}</td>
                    <td style={{ padding: '0.5rem' }}>{item.hit_count > 0 ? item.hit_count : '-'}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--warning)' }}>{item.price}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <button
                        className="btn sm"
                        onClick={() => handleBuyItem(item.id)}
                        disabled={loading || user.money < item.price}
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
        <div className="page-head">
          <div>
            <div className="page-eyebrow">Anaheim Electronics</div>
            <h1 className="page-title">ＡＥ月面工場</h1>
          </div>
          <button onClick={() => navigate('/mypage')} className="btn sm">マイページへ</button>
        </div>

        {/* アストナージ（結果メッセージもこの吹き出しに集約する） */}
        <div className="npc-dialog">
          <img className="npc-portrait" src="/images/npc/mechanic.png" alt="アストナージ" />
          <div className="npc-body">
            <div className="npc-name">アストナージ ─ 主任メカニック</div>
            <div className="npc-quote">「{astonajiMessage}」</div>
            {message && <div className="npc-note" style={{ color: 'var(--success)', whiteSpace: 'pre-line' }}>{message}</div>}
            {error && <div className="npc-note" style={{ color: 'var(--danger)' }}>{error}</div>}
          </div>
        </div>

        {/* 機体データパネル（t_anahim.jpg 上部） */}
        <div className="inset-panel" style={{ marginBottom: '1rem' }}>
          <div className="row-wrap" style={{ gap: '1.25rem' }}>
            <div className="unit-frame lg">
              {user.unit_image
                ? <UnitImage file={user.unit_image} alt={user.unit_name} />
                : <span className="no-image">No Image</span>}
            </div>
            <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div className="kv-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>ユニット</span>
                <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>{user.unit_custom_name || user.unit_name || '搭乗機なし'}</span>
                <button className="mini-btn" onClick={() => setShowUnitDesc(true)}>機体解説</button>
              </div>
              <div className="kv-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>武器</span>
                <span>{user.weapon_name || 'なし'}</span>
              </div>
              <div className="kv-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>装備</span>
                <span>{user.item1_name || 'なし'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '0.9rem', marginTop: '4px' }}>
                <div className="kv-row"><span style={{ color: 'var(--text-muted)' }}>耐久力</span><span>{user.current_hp}/{user.max_hp}</span></div>
                <div className="kv-row"><span style={{ color: 'var(--text-muted)' }}>ＥＮ</span><span>{user.current_en}/{user.max_en}</span></div>
                <div className="kv-row"><span style={{ color: 'var(--text-muted)' }}>運動</span><span>{user.unit_custom_mobility}</span></div>
                <div className="kv-row"><span style={{ color: 'var(--text-muted)' }}>索敵</span><span>{user.unit_custom_sensor}</span></div>
                <div className="kv-row"><span style={{ color: 'var(--text-muted)' }}>装甲</span><span>{user.unit_custom_armor}</span></div>
                <div className="kv-row"><span style={{ color: 'var(--text-muted)' }}>装備重量</span><span>{user.current_weight}/{user.max_weight}</span></div>
              </div>
              <div className="chip-row" style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                <span><span style={{ color: 'var(--text-muted)' }}>ポイント </span><b style={{ color: 'var(--warning)' }}>{user.money.toLocaleString()}</b></span>
                <span><span style={{ color: 'var(--text-muted)' }}>熟練度 </span><b>{user.level}</b></span>
                <span><span style={{ color: 'var(--text-muted)' }}>名声 </span><b>{user.fame}</b></span>
                <span><span style={{ color: 'var(--text-muted)' }}>カスタム数 </span><b>{user.unit_custom_lp}</b></span>
              </div>
            </div>
          </div>
        </div>

        {isChampion && (
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.5rem 0.8rem', borderRadius: 'var(--radius)' }}>
            <input type="checkbox" id="updateChampion" checked={updateChampion} onChange={(e) => setUpdateChampion(e.target.checked)} />
            <label htmlFor="updateChampion" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>カスタム/乗換/装備/変形時、優勝/防衛データへ反映する</label>
          </div>
        )}

        {/* 目的別タブ */}
        <div className="tab-row">
          <button className={`tab-btn ${tab === 'equip' ? 'active' : ''}`} onClick={() => setTab('equip')}>武器・装備</button>
          <button className={`tab-btn ${tab === 'unit' ? 'active' : ''}`} onClick={() => setTab('unit')}>機体の乗り換え</button>
          <button className={`tab-btn ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>カスタマイズ</button>
        </div>

        {tab === 'equip' && (
          <>
            {/* 装備変更 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 className="sec-title">装備を変更する</h3>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>「持ってる武器やアイテムを装備するかい？」</p>
              <div className="action-row">
                <select className="input-field" value={selectedEquipSlot} onChange={e => setSelectedEquipSlot(e.target.value)}>
                  <option value="weapon_id">武器</option>
                  <option value="item1_id">装備1</option>
                  <option value="item2_id">装備2</option>
                </select>
                <select className="input-field" style={{ minWidth: '220px' }} value={selectedInventoryId} onChange={e => setSelectedInventoryId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">選択して下さい</option>
                  <option value={0}>【外す】</option>
                  {inventory.map((inv: any) => (
                    <option key={inv.inventory_id} value={inv.inventory_id}>
                      {inv.name} (重量: {inv.weight})
                    </option>
                  ))}
                </select>
                <button className="btn primary" disabled={loading || selectedInventoryId === ''} onClick={handleEquip}>装備する</button>
              </div>
            </div>

            {/* 目録（購入） */}
            <div>
              <h3 className="sec-title">目録から購入する</h3>
              <div className="action-row" style={{ marginBottom: '0.5rem' }}>
                <button className={`btn sm ${showWeapons ? 'primary' : ''}`} onClick={() => { setShowWeapons(v => !v); setShowItems(false); }}>武器目録</button>
                <button className={`btn sm ${showItems ? 'primary' : ''}`} onClick={() => { setShowItems(v => !v); setShowWeapons(false); }}>装備目録</button>
              </div>
              {showWeapons && renderItemTable([1, 2, 3, 4, 5], '武器目録')}
              {showItems && renderItemTable([], '装備目録')}
              {!showWeapons && !showItems && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>目録を開くと、現在の機体に搭載可能な武器・装備の一覧と価格を確認できます。</p>
              )}
            </div>
          </>
        )}

        {tab === 'unit' && (
          <>
            {/* 機体購入 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 className="sec-title">機体を乗り換える</h3>
              <div className="action-row" style={{ marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="機体名に含まれる文字列を入力"
                  value={unitSearch}
                  onChange={e => setUnitSearch(e.target.value)}
                  style={{ flex: 1, minWidth: '200px' }}
                />
              </div>
              <div className="action-row">
                <select className="input-field" style={{ minWidth: '280px' }} value={selectedBuyUnitId} onChange={e => setSelectedBuyUnitId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">選択して下さい</option>
                  {filteredUnits.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.id === 9999 ? u.name : `${u.name}（${u.price}pt / 名声${u.req_fame}）`}
                    </option>
                  ))}
                </select>
                <button className="btn primary" disabled={loading || selectedBuyUnitId === ''} onClick={() => setConfirmBuyOpen(true)}>機体を変更する</button>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.4rem' }}>
                ※キャラクターリセットを選ぶとキャラクターを初期化、削除できます
              </div>
            </div>

            {/* 機体名称変更（senyou: 名声10消費） */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 className="sec-title">機体の名称を変更する<span className="sub">名声を10ポイント使用</span></h3>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>
                「ところで、お前の機体の名前を変えるかい？　な～に、ちょいと{user.chara_name}の顔を利かせてくれりゃ、すぐにできるぜ」
              </p>
              <div className="action-row">
                <select className="input-field" style={{ minWidth: '280px' }} value={renameTemplateId} onChange={e => setRenameTemplateId(Number(e.target.value))}>
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
                <button className="btn" disabled={loading || user.fame < 10} onClick={handleRename}>機体名称変更</button>
              </div>
            </div>

            {/* 変形（変形先があるときのみ） */}
            {transformTargets.length > 0 && (
              <div>
                <h3 className="sec-title">機体を変形させる</h3>
                <div className="action-row">
                  {transformTargets.map((t: any, i: number) => (
                    <button key={i} className="btn" disabled={loading || user.money < t.cost}
                      onClick={() => handleTransform(t.unit_id)}>
                      変形（{t.name} / {t.cost}G）
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'custom' && (
          <>
            {/* カスタマイズ（custmaise: 費用=機体価格、安全カスタム残回数表示） */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 className="sec-title">能力を強化する<span className="sub">費用 {unitPrice}pt / 回</span></h3>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                「なんだったら、お前の機体をカスタマイズするかい？　そのためにはポイントが{unitPrice}ほど必要だけどな」
              </p>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>
                「この俺なら、あと{remainingCustoms}箇所くらいはカスタマイズできるぜ」
              </p>
              <div className="action-row">
                <select className="input-field" style={{ minWidth: '200px' }} value={customizeTarget} onChange={e => setCustomizeTarget(Number(e.target.value))}>
                  <option value={1}>耐久力 (+10)</option>
                  <option value={2}>ＥＮ (+10)</option>
                  <option value={3}>装甲 (+2)</option>
                  <option value={4}>運動性 (+5)</option>
                  <option value={5}>索敵 (+5)</option>
                </select>
                <button className="btn primary" disabled={loading || user.money < unitPrice || user.unit_id === 0} onClick={handleCustomize}>カスタマイズ</button>
              </div>
            </div>

            {/* 置き換えカスタマイズ（custmaise_2） */}
            <div>
              <h3 className="sec-title">能力を置き換える<span className="sub">費用 {unitPrice}pt / 回</span></h3>
              <div className="action-row">
                <select className="input-field" value={custom2M} onChange={e => setCustom2M(Number(e.target.value))}>
                  {custom2Stats.map(s => <option key={s.id} value={s.id}>{s.name} ({s.dec})</option>)}
                </select>
                <span>を減らして</span>
                <select className="input-field" value={custom2S} onChange={e => setCustom2S(Number(e.target.value))}>
                  {custom2Stats.map(s => <option key={s.id} value={s.id}>{s.name} ({s.inc})</option>)}
                </select>
                <span>を強化する</span>
                <button className="btn primary" disabled={loading || user.money < unitPrice || user.unit_id === 0} onClick={handleCustomize2}>カスタマイズ</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 機体解説モーダル */}
      <Modal
        open={showUnitDesc}
        onClose={() => setShowUnitDesc(false)}
        title={user.unit_custom_name || user.unit_name}
        actions={<button className="text-btn" onClick={() => setShowUnitDesc(false)}>閉じる</button>}
      >
        <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
          {user.unit_description || '解説はありません。'}
        </p>
      </Modal>

      {/* 購入確認モーダル。キャラクターリセットは復旧できないので閉じにくくしてある */}
      <Modal
        open={confirmBuyOpen && !!selectedUnit}
        onClose={() => setConfirmBuyOpen(false)}
        title={selectedUnit?.id === 9999 ? 'キャラクターをリセットする' : '機体変更の確認'}
        dismissable={selectedUnit?.id !== 9999}
        actions={
          <>
            <button className="text-btn" onClick={() => setConfirmBuyOpen(false)}>キャンセル</button>
            <button
              className="submit-btn"
              onClick={handleBuyUnit}
              style={selectedUnit?.id === 9999 ? { background: 'var(--danger)' } : undefined}
            >
              {selectedUnit?.id === 9999 ? 'リセットする' : '購入して搭乗する'}
            </button>
          </>
        }
      >
        {selectedUnit?.id === 9999 ? (
          <p style={{ color: 'var(--text-primary)' }}>
            本当にキャラクターをリセットしますか？<br />
            <span style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>能力・所持金・機体が初期化されます。復旧はできません。</span>
          </p>
        ) : (
          <p style={{ color: 'var(--text-primary)' }}>
            {selectedUnit?.name} を {selectedUnit?.price}pt で購入し、搭乗しますか？<br />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>※現在の機体は格納庫に保管されます</span>
          </p>
        )}
      </Modal>
    </div>
  );
};
