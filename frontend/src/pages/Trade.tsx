import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { showConfirm } from '../components/confirm';
import { showPrompt } from '../components/prompt';
import './Register.css';

interface Listing {
  id: number;
  seller_id: string;
  seller_name: string;
  listing_type: 'unit' | 'item';
  target_id: number;
  price: number;
  message: string;
  created_at: string;
  // P34: オークション
  is_auction?: number;
  deadline_at?: number;
  current_bid?: number | null;
  current_bidder_name?: string | null;
  price_closed?: number;
  has_bid?: boolean;

  // Unit details
  unit_name?: string;
  unit_image?: string;
  unit_description?: string;
  hp?: number;
  en?: number;
  armor?: number;
  mobility?: number;
  sensor?: number;

  // Item details
  item_name?: string;
  item_description?: string;
  item_type?: number;
  power?: number;
  ammo?: number;
}

interface HangarItem {
  hangar_id: number;
  unit_id: number;
  name: string;
  hp: number;
  en: number;
  armor: number;
  mobility: number;
  sensor: number;
  image: string;
}

interface InventoryItem {
  inventory_id: number;
  item_id: number;
  name: string;
  description: string;
  item_type: number;
  power: number;
  ammo: number;
}

const Trade: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'market' | 'myListings' | 'sell'>('market');
  const [listings, setListings] = useState<Listing[]>([]);
  const [hangarItems, setHangarItems] = useState<HangarItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [userMoney, setUserMoney] = useState<number>(0);
  const [userId, setUserId] = useState<string>('');

  const [sellPrice, setSellPrice] = useState<string>('');
  const [sellMessage, setSellMessage] = useState<string>('');
  // P34: オークション出品
  const [sellIsAuction, setSellIsAuction] = useState(false);
  const [sellDeadline, setSellDeadline] = useState(24);
  const [sellPriceClosed, setSellPriceClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchListings = async () => {
    try {
      const res = await fetch('/api/trade/listings', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('gtactics_token')}` }
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setListings(data.listings);
      }
    } catch (e) {
      console.error('Failed to fetch listings', e);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('gtactics_token')}` }
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setUserMoney(data.user.money);
        setUserId(data.user.id);
      }
    } catch (e) {
      console.error('Failed to fetch profile', e);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch('/api/hangar', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('gtactics_token')}` }
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setHangarItems(data.hangar);
      }

      const itemRes = await fetch('/api/inventory', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('gtactics_token')}` }
      });
      const itemData = (await itemRes.json()) as any;
      if (itemData.success) {
        setInventoryItems(itemData.inventory);
      }
    } catch (e) {
      console.error('Failed to fetch inventory', e);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchListings();
    if (activeTab === 'sell') {
      fetchInventory();
    }
  }, [activeTab]);

  const handleBuy = async (listingId: number, price: number) => {
    if (userMoney < price) {
      setError('資金が足りません。');
      return;
    }
    if (!(await showConfirm(`${price}G で購入しますか？`, { title: '購入の確認', confirmLabel: '購入する' }))) return;

    try {
      const res = await fetch('/api/trade/buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('gtactics_token')}`
        },
        body: JSON.stringify({ listing_id: listingId })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSuccess(data.message);
        setError(null);
        fetchListings();
        fetchProfile();
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError('購入処理中にエラーが発生しました。');
    }
  };

  const handleCancel = async (listingId: number) => {
    if (!(await showConfirm('出品を取り下げますか？', { title: '取り下げの確認', confirmLabel: '取り下げる' }))) return;

    try {
      const res = await fetch('/api/trade/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('gtactics_token')}`
        },
        body: JSON.stringify({ listing_id: listingId })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSuccess(data.message);
        setError(null);
        fetchListings();
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError('キャンセル処理中にエラーが発生しました。');
    }
  };

  // P34: 入札
  const handleBid = async (l: Listing) => {
    const minBid = Math.max(l.price, (l.current_bid || 0) + 1);
    // 下限は showPrompt 側で弾くので、ここまで来た値は minBid 以上であることが保証される。
    // 以前は window.prompt の戻り値を `if (!input)` で見ており、"0" が falsy に落ちて
    // キャンセルと区別できていなかった（null との判定に直してある）。
    // 出品は機体とアイテムの両方があるので、一覧の表示と同じ出し分けにする
    const targetName = (l.listing_type === 'unit' ? l.unit_name : l.item_name) ?? '出品物';
    const input = await showPrompt(`${targetName} に入札します。`, {
      title: '入札',
      type: 'number',
      defaultValue: String(minBid),
      min: minBid,
      confirmLabel: '入札する',
    });
    if (input === null) return;
    const amount = parseInt(input, 10);
    if (isNaN(amount)) { setError('数値を入力してください。'); return; }
    try {
      const res = await fetch('/api/trade/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('gtactics_token')}` },
        body: JSON.stringify({ listing_id: l.id, amount })
      });
      const data = (await res.json()) as any;
      if (data.success) { setSuccess(data.message); setError(null); fetchListings(); }
      else setError(data.message);
    } catch (e) {
      setError('入札処理中にエラーが発生しました。');
    }
  };

  const handleSell = async (targetType: 'unit' | 'item', targetId: number) => {
    const p = parseInt(sellPrice, 10);
    if (isNaN(p) || p <= 0) {
      setError('価格は1G以上の数値を入力してください。');
      return;
    }

    try {
      const res = await fetch('/api/trade/sell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('gtactics_token')}`
        },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          price: p,
          message: sellMessage,
          is_auction: sellIsAuction,
          deadline_hours: sellDeadline,
          price_closed: sellPriceClosed
        })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSuccess(data.message);
        setError(null);
        setSellPrice('');
        setSellMessage('');
        fetchInventory();
        setActiveTab('myListings');
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError('出品処理中にエラーが発生しました。');
    }
  };

  const myListings = listings.filter(l => l.seller_id === userId);
  const marketListings = listings.filter(l => l.seller_id !== userId);

  const itemTypeLabel = (t?: number) => ['格闘', '射撃(近)', '射撃(中)', '射撃(遠)', 'サイコミュ', '盾/装甲', 'その他'][(t || 0) - 1] || '不明';

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '0.7rem 1rem',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border-color)',
    background: active ? 'var(--accent-color)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontWeight: active ? 'bold' : 'normal',
    cursor: 'pointer',
    fontFamily: 'inherit'
  });

  const cardStyle: React.CSSProperties = {
    background: 'var(--panel-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius)',
    padding: '1.5rem'
  };

  const statBox: React.CSSProperties = {
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius)',
    padding: '1rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))',
    gap: '0.8rem',
    fontSize: '0.85rem',
    color: 'var(--text-primary)'
  };

  const statLabel: React.CSSProperties = { color: 'var(--text-secondary)', display: 'block', fontSize: '0.7rem', marginBottom: '0.2rem' };

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>中古MS売り場</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>所持金: <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{userMoney} G</span></span>
            <button onClick={() => navigate('/mypage')} className="text-btn">RETURN TO BASE</button>
          </div>
        </div>

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}
        {success && <div className="success-message" style={{ marginBottom: '1rem' }}>{success}</div>}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
          <button style={tabStyle(activeTab === 'market')} onClick={() => { setActiveTab('market'); setError(null); setSuccess(null); }}>市場（他人の出品）</button>
          <button style={tabStyle(activeTab === 'myListings')} onClick={() => { setActiveTab('myListings'); setError(null); setSuccess(null); }}>自分の出品</button>
          <button style={tabStyle(activeTab === 'sell')} onClick={() => { setActiveTab('sell'); setError(null); setSuccess(null); }}>新しく出品する</button>
        </div>

        {activeTab === 'market' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {marketListings.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem 0' }}>市場に出品されている商品はありません。</p>
            ) : (
              marketListings.map(l => (
                <div key={l.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--accent-color)', margin: 0 }}>
                        {l.listing_type === 'unit' ? l.unit_name : l.item_name}
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                        出品者: <span style={{ color: 'var(--text-primary)' }}>{l.seller_name}</span>
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {l.is_auction ? (
                        <>
                          <div style={{ fontSize: '0.8rem', color: '#fbbf24' }}>オークション（最低 {l.price} G）</div>
                          <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                            現在入札額: {l.price_closed ? (l.has_bid ? '？？？？' : 'なし') : (l.current_bid ? `${l.current_bid} G` : 'なし')}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            締切: {l.deadline_at ? new Date(l.deadline_at * 1000).toLocaleString() : '-'}
                          </div>
                          <button
                            onClick={() => handleBid(l)}
                            className="submit-btn"
                            style={{ marginTop: '0.5rem', padding: '0.5rem 1.2rem' }}
                          >
                            入札する
                          </button>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{l.price} G</div>
                          <button
                            onClick={() => handleBuy(l.id, l.price)}
                            disabled={userMoney < l.price}
                            className="submit-btn"
                            style={{ marginTop: '0.5rem', padding: '0.5rem 1.2rem' }}
                          >
                            購入する
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {l.message && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius)', padding: '0.8rem', marginBottom: '1rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      「{l.message}」
                    </div>
                  )}

                  {l.listing_type === 'unit' && (
                    <div style={statBox}>
                      <div><span style={statLabel}>HP</span>{l.hp}</div>
                      <div><span style={statLabel}>EN</span>{l.en}</div>
                      <div><span style={statLabel}>装甲</span>{l.armor}</div>
                      <div><span style={statLabel}>運動</span>{l.mobility}</div>
                      <div><span style={statLabel}>索敵</span>{l.sensor}</div>
                    </div>
                  )}
                  {l.listing_type === 'item' && (
                    <div style={statBox}>
                      <div><span style={statLabel}>種類</span>{itemTypeLabel(l.item_type)}</div>
                      <div><span style={statLabel}>威力</span>{l.power}</div>
                      <div><span style={statLabel}>弾数</span>{l.ammo}</div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'myListings' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {myListings.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem 0' }}>あなたが出品している商品はありません。</p>
            ) : (
              myListings.map(l => (
                <div key={l.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>
                      {l.listing_type === 'unit' ? l.unit_name : l.item_name}
                    </h3>
                    <p style={{ color: 'var(--accent-color)', marginTop: '0.3rem' }}>{l.price} G</p>
                    {l.message && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>アピール: {l.message}</p>}
                  </div>
                  <button onClick={() => handleCancel(l.id)} className="text-btn" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                    出品を取り下げる
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'sell' && (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              <div style={cardStyle}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginTop: 0 }}>格納庫から出品</h2>
                {hangarItems.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>出品可能な機体がありません。</p>
                ) : (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {hangarItems.map(h => (
                      <div key={`h-${h.hangar_id}`} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--accent-color)', marginBottom: '0.3rem' }}>{h.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>HP:{h.hp} EN:{h.en}</div>
                        <button onClick={() => handleSell('unit', h.hangar_id)} className="submit-btn" style={{ width: '100%', padding: '0.5rem' }}>この機体を出品する</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginTop: 0 }}>アイテムボックスから出品</h2>
                {inventoryItems.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>出品可能なアイテムがありません。</p>
                ) : (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {inventoryItems.map(i => (
                      <div key={`i-${i.inventory_id}`} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--accent-color)', marginBottom: '0.3rem' }}>{i.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.description}</div>
                        <button onClick={() => handleSell('item', i.inventory_id)} className="submit-btn" style={{ width: '100%', padding: '0.5rem' }}>このアイテムを出品する</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: 0 }}>出品設定</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>上記リストから「出品する」ボタンを押す前に、価格とアピールメッセージを設定してください。</p>
              <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div className="cyber-input-wrapper">
                  <label className="cyber-label">販売価格 (G)</label>
                  <input type="number" className="cyber-input" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="例: 1000" min={1} />
                </div>
                <div className="cyber-input-wrapper">
                  <label className="cyber-label">アピールメッセージ（任意）</label>
                  <input type="text" className="cyber-input" value={sellMessage} onChange={(e) => setSellMessage(e.target.value)} placeholder="例: ほぼ新品です！" maxLength={50} />
                </div>
                <div className="cyber-input-wrapper">
                  <label className="cyber-label" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="checkbox" checked={sellIsAuction} onChange={e => setSellIsAuction(e.target.checked)} />
                    オークション形式で売り出す（価格は最低価格になります）
                  </label>
                  {sellIsAuction && (
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        締め切り
                        <input type="number" className="cyber-input" style={{ width: '5rem', margin: '0 0.4rem' }} value={sellDeadline} min={1} max={99} onChange={e => setSellDeadline(Number(e.target.value))} />
                        時間後
                      </label>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <input type="checkbox" checked={sellPriceClosed} onChange={e => setSellPriceClosed(e.target.checked)} />
                        価格クローズ（入札額を非公開にする）
                      </label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ※締切までに入札が無ければ最低価格の通常売り出しになります
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Trade;
