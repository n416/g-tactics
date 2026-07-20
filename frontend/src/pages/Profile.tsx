import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { showToast } from '../components/toast';
import { Modal } from '../components/Modal';
import './Register.css';
import { UnitImage } from '../components/UnitImage';

interface ProfileData {
  id: string;
  handle_name: string;
  chara_name: string;
  level: number;
  exp: number;
  money: number;
  fame: number;
  status_intuition: number;
  status_piloting: number;
  status_short_range: number;
  status_mid_range: number;
  status_long_range: number;
  unit_name: string;
  unit_image: string;
  unit_description: string;
  public_comment: string;
  katagaki: string;
  icon: string;
  total_battles: number;
  win_battles: number;
  unit_custom_mobility: number;
  weapon_name: string;
  traits: string;
}

export const Profile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');
  
  // Private Message
  const [myId, setMyId] = useState('');
  const [privateMessage, setPrivateMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [receivedMessages, setReceivedMessages] = useState<any[]>([]);
  const [showSendModal, setShowSendModal] = useState(false);

  // Base Attack
  const [showAttackModal, setShowAttackModal] = useState(false);
  const [targetBase, setTargetBase] = useState<any>(null);
  const [attackError, setAttackError] = useState('');
  const [isAttacking, setIsAttacking] = useState(false);

  // Hangar
  const [showHangarModal, setShowHangarModal] = useState(false);
  const [hangarUnits, setHangarUnits] = useState<any[]>([]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`/api/profile/${id}`);
        const data = (await response.json()) as any;
        if (data.success) {
          setProfile(data.profile);
          setReceivedMessages(data.received_messages || []);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('プロフィールの取得に失敗しました');
      }
    };

    const fetchMyId = async () => {
      const token = localStorage.getItem('gtactics_token');
      if (!token) return;
      try {
        const response = await fetch('/api/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json() as any;
        if (data.success && data.user) {
          setMyId(data.user.id);
        }
      } catch (err) {}
    };

    fetchProfile();
    fetchMyId();
  }, [id]);

  // 自分のステ詳細を開いた時に伝言を既読化（原作: 到着アラート→自ステ詳細で確認）
  useEffect(() => {
    if (myId && id && myId === id) {
      const token = localStorage.getItem('gtactics_token');
      if (token) {
        fetch('/api/messages/private/mark-read', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      }
    }
  }, [myId, id]);

  const sendMessage = async () => {
    if (!privateMessage.trim()) return;
    setIsSendingMessage(true);
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch(`/api/messages/private/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: privateMessage })
      });
      const data = await res.json() as any;
      if (data.success) {
        setPrivateMessage('');
        setShowSendModal(false);
        showToast('伝言を送信しました。', 'success');
      } else {
        showToast(data.message || '送信に失敗しました', 'error');
      }
    } catch (err) {
      showToast('送信エラーが発生しました', 'error');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const fetchHangar = async () => {
    try {
      const response = await fetch(`/api/profile/${id}/hangar`);
      const data = await response.json() as any;
      if (data.success) {
        setHangarUnits(data.hangar);
        setShowHangarModal(true);
      }
    } catch (e) {
      showToast('格納庫情報の取得に失敗しました', 'error');
    }
  };

  const openAttackModal = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch(`/api/base/user/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json() as any;
      if (data.success) {
        setTargetBase(data);
        setAttackError('');
        setShowAttackModal(true);
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('基地情報の取得に失敗しました', 'error');
    }
  };

  const executeAttack = async () => {
    setIsAttacking(true);
    setAttackError('');
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch(`/api/base/attack/${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json() as any;
      if (data.success) {
        showToast(data.message, 'success');
        setShowAttackModal(false);
        navigate(`/replay/${data.battleLogId}`);
      } else {
        setAttackError(data.message);
      }
    } catch (err) {
      setAttackError('通信エラーが発生しました');
    } finally {
      setIsAttacking(false);
    }
  };

  if (error && !profile) return <div className="register-container"><div className="error-message">{error}</div><button onClick={() => navigate('/ranking')} className="text-btn">BACK</button></div>;
  if (!profile) return <div className="register-container"><div style={{color: 'var(--accent-color)'}}>LOADING PROFILE...</div></div>;

  const totalPoints = profile.status_intuition + profile.status_piloting + profile.status_short_range + profile.status_mid_range + profile.status_long_range;
  const winRate = profile.total_battles > 0 ? ((profile.win_battles / profile.total_battles) * 100).toFixed(1) : '0.0';
  const hitIndicator = profile.status_intuition + profile.status_piloting + profile.status_mid_range; // Simplified
  const evadeIndicator = profile.status_intuition + profile.status_piloting + (profile.unit_custom_mobility || 0);

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', margin: 0 }}>PILOT PROFILE</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate(`/museum/${id}`)} className="submit-btn" style={{ margin: 0, padding: '0.4rem 1rem' }}>基地訪問</button>
            <button onClick={() => navigate('/ranking')} className="text-btn">BACK</button>
          </div>
        </div>
        
        {error && <div className="error-message" style={{marginBottom: '1rem'}}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="stats-allocation" style={{ margin: 0, flex: 1 }}>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ width: '80px', height: '80px', background: 'rgba(0,0,0,0.5)', border: '1px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {profile.icon ? <img src={`/images/chara/${profile.icon}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.currentTarget.src = '/images/no_image.png')} /> : <span style={{ color: '#888', fontSize: '0.8rem' }}>No Image</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', color: '#ecc94b' }}>{profile.katagaki || '新米パイロット'}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{profile.handle_name}</div>
                  <div style={{ fontSize: '0.9rem', color: '#4facfe' }}>{profile.chara_name}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px' }}>
                <div><div style={{ fontSize: '0.8rem', color: '#888' }}>レベル</div><div>Lv.{profile.level}</div></div>
                <div><div style={{ fontSize: '0.8rem', color: '#888' }}>経験値</div><div>{profile.exp}</div></div>
                <div><div style={{ fontSize: '0.8rem', color: '#888' }}>名声</div><div>{profile.fame || 0}</div></div>
                <div><div style={{ fontSize: '0.8rem', color: '#888' }}>所持金</div><div>{profile.money.toLocaleString()} pt</div></div>
              </div>
            </div>

            <div className="stats-allocation" style={{ margin: 0 }}>
              <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem' }}>STATUS ({totalPoints})</h3>
              <div className="stats-grid">
                <div className="stat-row"><label>直感</label><div style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{profile.status_intuition}</div></div>
                <div className="stat-row"><label>操縦</label><div style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{profile.status_piloting}</div></div>
                <div className="stat-row"><label>近距離</label><div style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{profile.status_short_range}</div></div>
                <div className="stat-row"><label>中距離</label><div style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{profile.status_mid_range}</div></div>
                <div className="stat-row"><label>遠距離</label><div style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{profile.status_long_range}</div></div>
              </div>
            </div>
            
            <div className="stats-allocation" style={{ margin: 0 }}>
              <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem' }}>公開メッセージ</h3>
              <div style={{ fontSize: '0.9rem', color: '#ddd', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                {profile.public_comment || '（自己紹介はまだありません）'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="stats-allocation" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                <h3 style={{ color: '#aaa', fontSize: '0.9rem', margin: 0 }}>搭乗機体</h3>
                <button onClick={fetchHangar} className="text-btn" style={{ fontSize: '0.8rem', padding: '2px 8px', border: '1px solid #4facfe' }}>格納庫(機体表示)</button>
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ width: '100px', height: '100px', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {profile.unit_image ? <UnitImage file={profile.unit_image} style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <span style={{ color: '#888', fontSize: '0.8rem' }}>No Image</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1.2rem', color: '#4facfe', fontWeight: 'bold' }}>{profile.unit_name || 'Unknown'}</div>
                  <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '10px' }}>主武装: {profile.weapon_name || 'なし'}</div>
                </div>
              </div>
            </div>

            <div className="stats-allocation" style={{ margin: 0 }}>
              <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem' }}>戦闘力分析</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888', fontSize: '0.9rem' }}>戦闘履歴</span>
                  <span style={{ fontSize: '0.9rem' }}>{profile.win_battles}勝 {profile.total_battles > profile.win_battles ? profile.total_battles - profile.win_battles : 0}敗 ({winRate}%)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888', fontSize: '0.9rem' }}>機体基本運動性</span>
                  <span style={{ fontSize: '0.9rem' }}>{profile.unit_custom_mobility || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888', fontSize: '0.9rem' }}>命中指標 (直+操+中)</span>
                  <span style={{ fontSize: '0.9rem', color: '#4bc8ff' }}>{hitIndicator}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888', fontSize: '0.9rem' }}>回避指標 (直+操+運)</span>
                  <span style={{ fontSize: '0.9rem', color: '#ecc94b' }}>{evadeIndicator}</span>
                </div>
              </div>
            </div>

            {/* 伝言記録（準公開・原作 manual_dengon: ステ詳細に着信降順・最大10件） */}
            <div className="stats-allocation" style={{ margin: 0 }}>
              <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem' }}>伝言記録 (最新10件)</h3>
              {receivedMessages.length === 0 ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '0.5rem', fontSize: '0.85rem' }}>届いている伝言はありません。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {receivedMessages.map((msg) => (
                    <div key={msg.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.85rem' }}>
                      {msg.sender_id && (
                        <button className="text-btn" style={{ padding: '2px 6px', fontSize: '0.75rem', flexShrink: 0 }} onClick={() => navigate(`/profile/${msg.sender_id}`)} title="送信者のステ詳細へ">詳細</button>
                      )}
                      <div style={{ flex: 1 }}>
                        <span style={{ color: '#4facfe' }}>{msg.sender_name || '不明'} さん</span>
                        <span style={{ color: '#fff' }}> ＞ 「{msg.message}」</span>
                        <span style={{ color: '#888', fontSize: '0.75rem' }}> ({new Date(msg.created_at).toLocaleDateString('ja-JP')})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {myId && myId !== id && (
              <div className="stats-allocation" style={{ margin: 0 }}>
                <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem' }}>アクション</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="submit-btn" style={{ margin: 0, flex: 1 }} onClick={() => setShowSendModal(true)}>伝言を送る</button>
                  <button className="submit-btn" style={{ margin: 0, flex: 1, background: 'var(--accent-color)', borderColor: 'var(--accent-color)' }} onClick={openAttackModal}>基地を襲撃</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        title={`${profile.chara_name} へ伝言を送る (MES)`}
        actions={
          <>
            <button className="text-btn" onClick={() => setShowSendModal(false)}>キャンセル</button>
            <button className="submit-btn" style={{ margin: 0 }} disabled={isSendingMessage || !privateMessage.trim()} onClick={sendMessage}>
              {isSendingMessage ? '送信中...' : '送信'}
            </button>
          </>
        }
      >
        <textarea
          className="cyber-input"
          placeholder="メッセージを入力...（最大100文字）"
          value={privateMessage}
          onChange={(e) => setPrivateMessage(e.target.value)}
          style={{ width: '100%', minHeight: '120px', resize: 'vertical', fontSize: '1rem', lineHeight: 1.5, padding: '10px', boxSizing: 'border-box' }}
          maxLength={100}
          autoFocus
        />
        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#888', marginTop: 4 }}>{privateMessage.length}/100</div>
      </Modal>

      <Modal
        open={showHangarModal}
        onClose={() => setShowHangarModal(false)}
        title="格納庫（所有機体一覧）"
        actions={<button className="text-btn" onClick={() => setShowHangarModal(false)}>閉じる</button>}
      >
        {hangarUnits.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>格納されている機体はありません。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {hangarUnits.map(unit => (
              <div key={unit.hangar_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--panel-inset)', padding: '10px', borderRadius: '4px' }}>
                <div style={{ width: '60px', height: '60px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  {unit.image ? <UnitImage file={unit.image} style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <span style={{ fontSize: '0.7rem' }}>No Image</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold' }}>{unit.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>HP: {unit.hp} / EN: {unit.en}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={showAttackModal}
        onClose={() => setShowAttackModal(false)}
        title="基地を襲撃する"
        actions={
          <>
            <button className="text-btn" onClick={() => setShowAttackModal(false)}>キャンセル</button>
            <button 
              className="submit-btn" 
              style={{ margin: 0, background: 'var(--accent-color)', borderColor: 'var(--accent-color)' }} 
              disabled={isAttacking || (targetBase && !targetBase.canAttack)} 
              onClick={executeAttack}
            >
              {isAttacking ? '出撃中...' : '出撃！'}
            </button>
          </>
        }
      >
        {targetBase && (
          <div style={{ color: 'var(--text-primary)' }}>
            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              相手の基地に攻撃を仕掛け、未回収の資金を奪い取ります。（防衛施設により反撃を受ける場合があります）
            </p>
            <div style={{ background: 'var(--panel-inset)', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.5rem', color: '#4facfe' }}>{targetBase.base.name}</div>
              <div style={{ fontSize: '0.9rem', color: '#aaa' }}>オーナー: {targetBase.chara_name}</div>
              <div style={{ fontSize: '0.9rem', color: '#aaa' }}>地形: {['', '地上', '水中', '宇宙', '空中', '仮想空間'][targetBase.base.terrain]}</div>
            </div>
            <div style={{ background: 'var(--panel-inset)', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#aaa' }}>防衛施設レベル予測</div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ color: '#aaa' }}>発電所</div>
                  <div style={{ fontWeight: 'bold' }}>Lv {targetBase.facilities.power || 0}</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ color: '#aaa' }}>砲台</div>
                  <div style={{ fontWeight: 'bold' }}>Lv {targetBase.facilities.turret || 0}</div>
                </div>
              </div>
            </div>
            {!targetBase.canAttack && (
              <div className="error-message" style={{ margin: 0, fontSize: '0.9rem' }}>
                {targetBase.reason}
                {targetBase.shieldRemainingSec > 0 && `（残り ${Math.floor(targetBase.shieldRemainingSec / 3600)}時間${Math.floor((targetBase.shieldRemainingSec % 3600) / 60)}分）`}
              </div>
            )}
            {attackError && (
              <div className="error-message" style={{ margin: '1rem 0 0 0', fontSize: '0.9rem' }}>
                {attackError}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
