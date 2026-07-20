import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UnitImage } from '../components/UnitImage';
import { showToast } from '../components/toast';
import { Modal } from '../components/Modal';
import { Guestbook } from '../components/Guestbook';
import './Museum.css';

type UnitStats = {
  id: number;
  unit_id?: number; // collectionAPIの互換用
  name: string;
  image: string;
  obtained_count: number;
  first_obtained_at: string | null;
  total_kills: number;
  max_win_streak: number;
  unit_lv?: number;
  is_collected?: boolean;
};

type Exhibit = {
  slot_index: number;
  unit: UnitStats | null;
};

type MuseumData = {
  progress: { collected: number, total: number };
  museumLevel: number;
  slots: number;
  exhibits: Exhibit[];
  featured: { unit: UnitStats, comment: string } | null;
  ownedUnits: UnitStats[];
  owner?: { id: string, handle_name: string, chara_name: string };
  base?: { name: string, terrain: number } | null;
};

export const Museum: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const isVisitorMode = !!userId;
  const [myId, setMyId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MuseumData | null>(null);
  const [collection, setCollection] = useState<UnitStats[]>([]);
  
  const [activeTab, setActiveTab] = useState<'hall' | 'edit' | 'pokedex'>('hall');

  // Edit Mode state
  const [selectedInventoryUnit, setSelectedInventoryUnit] = useState<UnitStats | null>(null);
  
  // Featured Mode state
  const [featuredModal, setFeaturedModal] = useState(false);
  const [featuredUnitId, setFeaturedUnitId] = useState<number>(0);
  const [featuredComment, setFeaturedComment] = useState('');

  // Pokedex filters
  const [pokeSearch, setPokeSearch] = useState('');
  const [pokeFilter, setPokeFilter] = useState('all');
  const [pokeSort, setPokeSort] = useState('id');

  const fetchMyId = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const res = await fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token }});
      const d = await res.json() as any;
      if (d.success && d.user) setMyId(d.user.id);
    } catch (e) {}
  };

  const fetchMuseum = async () => {
    setLoading(true);
    const token = localStorage.getItem('gtactics_token');
    try {
      const endpoint = isVisitorMode ? `/api/museum/user/${userId}` : '/api/museum';
      const res = await fetch(endpoint, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const d = await res.json() as any;
      if (d.success) {
        setData(d);
        if (d.featured) {
          setFeaturedUnitId(d.featured.unit.id);
          setFeaturedComment(d.featured.comment);
        }
      } else {
        showToast(d.message || 'データ取得エラー', 'error');
      }
    } catch (e) {
      showToast('通信エラー', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCollection = async () => {
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch('/api/museum/collection', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const d = await res.json() as any;
      if (d.success) setCollection(d.collection);
    } catch (e) {
      showToast('図鑑データ取得エラー', 'error');
    }
  };

  useEffect(() => {
    fetchMyId();
    fetchMuseum();
    if (!isVisitorMode) fetchCollection();
  }, [userId]);

  if (loading || !data) return <div className="layout-main" style={{color:'var(--text-secondary)'}}>Loading...</div>;

  if (data.museumLevel === 0) {
    return (
      <div className="layout-main page">
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <h2>博物館が建設されていません</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            {isVisitorMode ? 'このプレイヤーはまだ博物館を建設していません。' : '基地にて「博物館」施設を建設してください。'}
          </p>
          <button className="museum-btn primary" onClick={() => isVisitorMode ? navigate(`/profile/${userId}`) : navigate('/base')}>
            {isVisitorMode ? 'プロフィールに戻る' : '基地へ行く'}
          </button>
        </div>
      </div>
    );
  }

  const handleSetExhibit = async (slotIndex: number, unitId: number) => {
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch('/api/museum/exhibit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ slot_index: slotIndex, unit_id: unitId })
      });
      const d = await res.json() as any;
      if (d.success) {
        showToast(d.message, 'success');
        fetchMuseum();
        setSelectedInventoryUnit(null);
      } else {
        showToast(d.message, 'error');
      }
    } catch (e) {
      showToast('通信エラー', 'error');
    }
  };

  const handleSaveFeatured = async () => {
    if (featuredComment.length > 100) {
      showToast('コメントは100文字以内で入力してください', 'error');
      return;
    }
    const token = localStorage.getItem('gtactics_token');
    try {
      const res = await fetch('/api/museum/featured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ unit_id: featuredUnitId, comment: featuredComment })
      });
      const d = await res.json() as any;
      if (d.success) {
        showToast(d.message, 'success');
        fetchMuseum();
        setFeaturedModal(false);
      } else {
        showToast(d.message, 'error');
      }
    } catch (e) {
      showToast('通信エラー', 'error');
    }
  };

  // Build exhibit slots for UI (1 to max slots)
  const renderSlots = () => {
    const arr = [];
    for (let i = 1; i <= data.slots; i++) {
      const ex = data.exhibits.find(e => e.slot_index === i);
      if (ex && ex.unit) {
        arr.push(
          <div className="exhibit" key={i}>
            <div className="light"></div>
            <div className="body"><div className="unit-img"><UnitImage file={ex.unit.image} alt={ex.unit.name} /></div></div>
            <div className="base-slab"></div>
            <div className="plaque">
              <span className="name">{ex.unit.name}</span>
              <span className="meta"><span>撃墜 {ex.unit.total_kills}</span><span className="count">入手 ×{ex.unit.obtained_count}</span></span>
            </div>
          </div>
        );
      } else {
        arr.push(
          <div className="exhibit empty" key={i}>
            <div className="body"><span className="q">？</span></div>
            <div className="base-slab"></div>
            <div className="plaque">
              <span className="model">— 未収蔵 —</span><span className="name">空き展示台</span>
              <span className="meta"><span>機体を配置可能</span></span>
            </div>
          </div>
        );
      }
    }
    // Render a few locked slots as visual hint
    const maxPossible = 24;
    for (let i = data.slots + 1; i <= Math.min(data.slots + 2, maxPossible); i++) {
      arr.push(
        <div className="exhibit empty locked" key={`locked-${i}`}>
          <div className="body"><span className="q">🔒</span></div>
          <div className="base-slab"></div>
          <div className="plaque">
            <span className="model">— ロック —</span><span className="name">未解放</span>
            <span className="meta"><span>博物館Lvアップで解放</span></span>
          </div>
        </div>
      );
    }
    return arr;
  };

  const renderEditSlots = () => {
    const arr = [];
    for (let i = 1; i <= data.slots; i++) {
      const ex = data.exhibits.find(e => e.slot_index === i);
      if (ex && ex.unit) {
        arr.push(
          <div className="edit-exhibit filled" key={i}>
            <div style={{fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'5px'}}>枠 {i}</div>
            <div style={{fontSize:'0.85rem'}}>{ex.unit.name}</div>
            <button className="museum-btn" style={{marginTop:'10px', padding:'0.2rem 0.5rem', fontSize:'0.7rem'}}
              onClick={() => handleSetExhibit(i, 0)}>外す</button>
            {selectedInventoryUnit && (
              <button className="museum-btn primary" style={{marginTop:'5px', padding:'0.2rem 0.5rem', fontSize:'0.7rem'}}
                onClick={() => handleSetExhibit(i, selectedInventoryUnit.id)}>入れ替え</button>
            )}
          </div>
        );
      } else {
        arr.push(
          <div className="edit-exhibit" key={i} onClick={() => selectedInventoryUnit && handleSetExhibit(i, selectedInventoryUnit.id)}>
            <div style={{fontSize:'0.75rem', color:'var(--accent-cyan)', marginBottom:'5px'}}>枠 {i}</div>
            <div style={{fontSize:'0.85rem', color:'var(--text-muted)'}}>空き</div>
            {selectedInventoryUnit && <div style={{fontSize:'0.7rem', color:'var(--accent-cyan)', marginTop:'10px'}}>ここに配置</div>}
          </div>
        );
      }
    }
    return arr;
  };

  const filteredCollection = collection.filter(c => {
    if (pokeFilter === 'collected' && !c.is_collected) return false;
    if (pokeFilter === 'uncollected' && c.is_collected) return false;
    if (pokeSearch && !c.name.includes(pokeSearch)) return false;
    return true;
  }).sort((a, b) => {
    if (pokeSort === 'id') return a.id - b.id;
    if (pokeSort === 'obtained') return (b.obtained_count || 0) - (a.obtained_count || 0);
    if (pokeSort === 'kills') return (b.total_kills || 0) - (a.total_kills || 0);
    return 0;
  });

  return (
    <main className="layout-main page museum-page" style={{ position: 'relative' }}>
      
      {isVisitorMode && data.owner && (
        <div style={{ background: 'var(--accent-cyan)', color: '#000', padding: '10px', textAlign: 'center', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 10 }}>
          他プレイヤー ({data.owner.handle_name}) の基地を見学中
          <button className="museum-btn" style={{ marginLeft: '1rem', padding: '0.2rem 1rem', background: '#000', color: 'var(--accent-cyan)' }} onClick={() => navigate('/museum')}>
            自分の博物館へ帰還
          </button>
        </div>
      )}

      <div className="museum-nav">
        <button className={activeTab === 'hall' ? 'active' : ''} onClick={() => setActiveTab('hall')}>博物館ホール</button>
        {!isVisitorMode && <button className={activeTab === 'edit' ? 'active' : ''} onClick={() => setActiveTab('edit')}>展示を編集</button>}
        {!isVisitorMode && <button className={activeTab === 'pokedex' ? 'active' : ''} onClick={() => setActiveTab('pokedex')}>機体図鑑</button>}
      </div>

      {activeTab === 'hall' && (
        <section id="hall">
          <div className="hall">
            <div className="hall-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0 }}>{data.owner ? `${data.base?.name || '名称未設定'} - ${data.owner.handle_name} の博物館` : '機体博物館'}</h2>
                {isVisitorMode && (
                  <button className="text-btn" style={{ padding: 0, marginTop: '5px' }} onClick={() => navigate(`/profile/${userId}`)}>
                    ← プロフィールに戻る
                  </button>
                )}
              </div>
              <div className="collection" onClick={() => !isVisitorMode && setActiveTab('pokedex')} style={{cursor: isVisitorMode ? 'default' : 'pointer'}}>
                <span className="col-label"><span>収蔵図鑑</span><span><strong>{data.progress.collected}</strong> / {data.progress.total} 機</span></span>
                <div className="col-bar"><span style={{width: `${(data.progress.collected / data.progress.total) * 100}%`}}></span></div>
              </div>
            </div>

            <div className="featured">
              {!isVisitorMode && <button className="museum-btn gold edit-btn" onClick={() => setFeaturedModal(true)}>殿堂を設定</button>}
              <div className="stage">
                <div className="spotlight"></div>
                {data.featured ? (
                  <div className="hero-image"><UnitImage file={data.featured.unit.image} alt={data.featured.unit.name} /></div>
                ) : (
                  <div className="placeholder-img">殿堂未設定</div>
                )}
                <div className="pedestal"></div>
              </div>
              <div className="plaque-main">
                <span className="exhibit-tag">殿堂展示 — 館長のお気に入り</span>
                {data.featured ? (
                  <>
                    <h3>{data.featured.unit.name}</h3>
                    <div className="stat-row">
                      <div className="stat"><span className="k">入手回数</span><span className="v gold">{data.featured.unit.obtained_count}</span></div>
                      <div className="stat"><span className="k">初入手</span><span className="v">{data.featured.unit.first_obtained_at?.split(' ')[0] || '---'}</span></div>
                      <div className="stat"><span className="k">総撃墜</span><span className="v">{data.featured.unit.total_kills}</span></div>
                      <div className="stat"><span className="k">最高連勝</span><span className="v">{data.featured.unit.max_win_streak}</span></div>
                    </div>
                    {data.featured.comment && (
                      <p className="owner-note">{data.featured.comment}</p>
                    )}
                  </>
                ) : (
                  <p style={{color: 'var(--text-muted)'}}>右上のボタンから機体を設定してください</p>
                )}
              </div>
            </div>

            <div>
              <div className="gallery-head">
                <h3 style={{fontSize: '1rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0'}}>一般展示 (Lv {data.museumLevel}: 枠数 {data.slots})</h3>
                {!isVisitorMode && <button className="museum-btn" onClick={() => setActiveTab('edit')}>展示を編集する</button>}
              </div>
              <div className="gallery">
                {renderSlots()}
              </div>
            </div>
            
            <Guestbook targetUserId={userId || (myId as string)} myUserId={myId} />
          </div>
        </section>
      )}

      {activeTab === 'edit' && (
        <section id="edit">
          <h2 className="section-title">展示機体の配置</h2>
          <div className="edit-mode">
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop:0}}>1. 下の収蔵リストから機体を選んでください。</p>
            <div className="inventory">
              {(data.ownedUnits || []).length === 0 ? (
                <div style={{color: 'var(--text-muted)', padding: '1rem'}}>所持している収蔵機体がありません</div>
              ) : (
                (data.ownedUnits || []).map(u => (
                  <div key={u.id} className={`inv-item ${selectedInventoryUnit?.id === u.id ? 'selected' : ''}`} onClick={() => setSelectedInventoryUnit(u)}>
                    <div className="img-ph"><UnitImage file={u.image} alt={u.name} /></div>
                    <div className="name">{u.name}</div>
                  </div>
                ))
              )}
            </div>

            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>2. 配置する展示台をクリックしてください。</p>
            <div className="edit-grid">
              {renderEditSlots()}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'pokedex' && (
        <section id="pokedex">
          <h2 className="section-title">図鑑 (コレクション一覧)</h2>
          <div className="pokedex">
            <div className="poke-filters">
              <input type="text" placeholder="機体名で検索..." style={{flex:1, minWidth:'150px', maxWidth:'250px'}} value={pokeSearch} onChange={e => setPokeSearch(e.target.value)} />
              <select value={pokeFilter} onChange={e => setPokeFilter(e.target.value)}>
                <option value="all">すべて表示</option>
                <option value="collected">収蔵済み</option>
                <option value="uncollected">未収蔵</option>
              </select>
              <select value={pokeSort} onChange={e => setPokeSort(e.target.value)}>
                <option value="id">図鑑番号順</option>
                <option value="obtained">入手回数順</option>
                <option value="kills">総撃墜順</option>
              </select>
            </div>
            
            <div className="poke-grid">
              {filteredCollection.map(c => (
                <div key={c.id || c.unit_id} className={`poke-card ${c.is_collected ? '' : 'uncollected'}`}>
                  <div className="img-ph">{c.is_collected ? <UnitImage file={c.image} alt={c.name} /> : '？'}</div>
                  <div className="name">{c.name}</div>
                  <div className="stats"><span>撃墜 {c.total_kills}</span><span>{c.is_collected ? `入手 ${c.obtained_count}` : '未入手'}</span></div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Config Modal（見学モードでは ownedUnits が無いため描画しない） */}
      {!isVisitorMode && <Modal open={featuredModal} title="殿堂・館長コメント編集" onClose={() => setFeaturedModal(false)}
        actions={[
          <button key="cancel" className="museum-btn" onClick={() => setFeaturedModal(false)}>キャンセル</button>,
          <button key="save" className="museum-btn primary" onClick={handleSaveFeatured}>保存する</button>
        ]}
      >
        <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          <div>
            <label style={{display:'block', marginBottom:'0.5rem'}}>殿堂機体の選択</label>
            <select style={{width:'100%', padding:'8px', background:'var(--bg-raised)', border:'1px solid var(--border-color)', color:'var(--text-primary)', borderRadius:'4px'}}
              value={featuredUnitId} onChange={e => setFeaturedUnitId(Number(e.target.value))}>
              <option value={0}>設定しない</option>
              {(data.ownedUnits || []).map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{display:'block', marginBottom:'0.5rem'}}>館長コメント</label>
            <textarea 
              style={{width:'100%', height:'100px', background:'var(--bg-color)', border:'1px solid var(--border-color)', color:'var(--text-primary)', padding:'0.5rem', borderRadius:'var(--radius)', resize:'vertical'}}
              placeholder="機体への思い入れなどを記入..."
              value={featuredComment}
              onChange={e => setFeaturedComment(e.target.value)}
            />
            <div style={{textAlign:'right', fontSize:'0.75rem', color: featuredComment.length > 100 ? 'var(--danger)' : 'var(--text-muted)'}}>
              {featuredComment.length} / 100 文字
            </div>
          </div>
        </div>
      </Modal>}

    </main>
  );
};
