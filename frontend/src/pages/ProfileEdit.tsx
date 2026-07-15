import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; // Reuse cyber theme CSS

interface Icon {
  filename: string;
  is_used: boolean;
}

export const ProfileEdit: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [sysMsg, setSysMsg] = useState('');

  const [formData, setFormData] = useState({
    current_password: '',
    new_password: '',
    handle_name: '',
    chara_name: '',
    public_comment: '',
    katagaki: '',
    icon: '',
    team_notify: 0,
    battle_comments: {
      start: '',
      skill: '',
      critical: '',
      kakuto: '',
      rensha: '',
      seimitsu: '',
      dodge: '',
      win: '',
      lose: '',
      partner_critical: '',
      partner_dodge: '',
      partner_win: '',
      partner_lose: '',
      others: [] as string[]
    }
  });

  const [icons, setIcons] = useState<Icon[]>([]);
  const [showIconModal, setShowIconModal] = useState(false);
  const [userFame, setUserFame] = useState(0);

  useEffect(() => {
    fetchMe();
    fetchIcons();
  }, []);

  const fetchMe = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      if (!token) {
        navigate('/');
        return;
      }
      const res = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json() as any;
      if (data.success) {
        const u = data.user;
        setUserFame(u.fame);
        let bc = u.battle_comments;
        if (typeof bc === 'string') {
          try { bc = JSON.parse(bc); } catch (e) { bc = {}; }
        }
        setFormData({
          current_password: '',
          new_password: '',
          handle_name: u.handle_name || '',
          chara_name: u.chara_name || '',
          public_comment: u.public_comment || '',
          katagaki: u.katagaki || '',
          icon: u.icon || '',
          team_notify: u.team_notify || 0,
          battle_comments: {
            start: bc?.start || '',
            skill: bc?.skill || '',
            critical: bc?.critical || '',
            kakuto: bc?.kakuto || '',
            rensha: bc?.rensha || '',
            seimitsu: bc?.seimitsu || '',
            dodge: bc?.dodge || '',
            win: bc?.win || '',
            lose: bc?.lose || '',
            partner_critical: bc?.partner_critical || '',
            partner_dodge: bc?.partner_dodge || '',
            partner_win: bc?.partner_win || '',
            partner_lose: bc?.partner_lose || '',
            others: bc?.others || []
          }
        });
      } else {
        navigate('/');
      }
    } catch (e) {
      setError('ユーザー情報の取得に失敗しました');
    }
  };

  const fetchIcons = async () => {
    try {
      const res = await fetch('/api/icons');
      const data = await res.json() as any;
      if (data.success) {
        setIcons(data.icons);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdate = async () => {
    try {
      const token = localStorage.getItem('gtactics_token');
      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json() as any;
      if (data.success) {
        setSysMsg(data.message);
        setTimeout(() => {
          navigate('/mypage');
        }, 1500);
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError('更新処理に失敗しました');
    }
    setTimeout(() => setError(''), 3000);
  };

  const addOtherComment = () => {
    setFormData({
      ...formData,
      battle_comments: {
        ...formData.battle_comments,
        others: [...formData.battle_comments.others, '']
      }
    });
  };

  const updateOtherComment = (index: number, val: string) => {
    const newOthers = [...formData.battle_comments.others];
    newOthers[index] = val;
    setFormData({
      ...formData,
      battle_comments: { ...formData.battle_comments, others: newOthers }
    });
  };

  const removeOtherComment = (index: number) => {
    const newOthers = [...formData.battle_comments.others];
    newOthers.splice(index, 1);
    setFormData({
      ...formData,
      battle_comments: { ...formData.battle_comments, others: newOthers }
    });
  };

  return (
    <div className="register-container" style={{ padding: '20px', minHeight: '100vh' }}>
      <div className="glass-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', margin: 0 }}>プロフィール変更</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn" style={{ color: '#aaa' }}>＜＜戻る</button>
        </div>

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}
        {sysMsg && <div style={{ background: 'rgba(72,187,120,0.2)', color: '#48bb78', padding: '10px', borderRadius: '4px', marginBottom: '1rem', border: '1px solid #48bb78', textAlign: 'center' }}>{sysMsg}</div>}

        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div 
              style={{ width: '120px', height: '120px', background: 'rgba(0,0,0,0.5)', border: '1px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}
              onClick={() => setShowIconModal(true)}
            >
              {formData.icon ? <img src={`/images/chara/${formData.icon}`} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => (e.currentTarget.src = '/images/no_image.png')} /> : <span style={{ color: '#888', fontSize: '0.8rem' }}>【顔選択】</span>}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#aaa', textAlign: 'center' }}>画像クリックで変更</div>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: '10px' }}>
              <label style={{ color: '#4facfe', fontSize: '0.9rem' }}>パスワード</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="password" placeholder="現在のパスワード" className="cyber-input" style={{ flex: 1 }} value={formData.current_password} onChange={e => setFormData({ ...formData, current_password: e.target.value })} />
                <input type="password" placeholder="新しいパスワード" className="cyber-input" style={{ flex: 1 }} value={formData.new_password} onChange={e => setFormData({ ...formData, new_password: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: '10px' }}>
              <label style={{ color: '#4facfe', fontSize: '0.9rem' }}>ハンドル</label>
              <input type="text" className="cyber-input" value={formData.handle_name} onChange={e => setFormData({ ...formData, handle_name: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: '10px' }}>
              <label style={{ color: '#4facfe', fontSize: '0.9rem' }}>ランカー名</label>
              <input type="text" className="cyber-input" value={formData.chara_name} onChange={e => setFormData({ ...formData, chara_name: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: '10px' }}>
              <label style={{ color: '#4facfe', fontSize: '0.9rem' }}>ランカーの呼称</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="text" className="cyber-input" style={{ flex: 1 }} value={formData.katagaki} onChange={e => setFormData({ ...formData, katagaki: e.target.value })} />
                <span style={{ fontSize: '0.8rem', color: '#ecc94b' }}>※変更時 名声1消費 (現在: {userFame})</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'flex-start', gap: '10px' }}>
              <label style={{ color: '#4facfe', fontSize: '0.9rem', marginTop: '8px' }}>公開文</label>
              <textarea className="cyber-input" style={{ height: '80px', resize: 'vertical' }} value={formData.public_comment} onChange={e => setFormData({ ...formData, public_comment: e.target.value })} placeholder="ステータス詳細画面に表示される紹介文です" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: '10px' }}>
              <label style={{ color: '#4facfe', fontSize: '0.9rem' }}>チーム組込許可</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#ddd' }}>
                <input type="checkbox" checked={formData.team_notify === 1} onChange={e => setFormData({ ...formData, team_notify: e.target.checked ? 1 : 0 })} />
                チームメンバーに組み込まれた際に伝言を受け取る
              </label>
            </div>
          </div>
        </div>

        <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem' }}>戦闘時コメント</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {[
            { key: 'start', label: '戦闘開始時' },
            { key: 'skill', label: 'クラススキル発動時' },
            { key: 'critical', label: 'クリティカル時' },
            { key: 'kakuto', label: '格闘発動時' },
            { key: 'rensha', label: '連続射撃発動時' },
            { key: 'seimitsu', label: '精密射撃発動時' },
            { key: 'dodge', label: '回避時' },
            { key: 'win', label: '勝利時' },
            { key: 'lose', label: '敗北時' },
          ].map(f => (
            <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: '10px' }}>
              <label style={{ color: '#888', fontSize: '0.9rem' }}>{f.label}</label>
              <input type="text" className="cyber-input" value={(formData.battle_comments as any)[f.key]} onChange={e => setFormData({ ...formData, battle_comments: { ...formData.battle_comments, [f.key]: e.target.value } })} />
            </div>
          ))}
          
          {formData.battle_comments.others.map((comment, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 60px', alignItems: 'center', gap: '10px' }}>
              <label style={{ color: '#888', fontSize: '0.9rem' }}>その他 {i + 1}</label>
              <input type="text" className="cyber-input" value={comment} onChange={e => updateOtherComment(i, e.target.value)} />
              <button onClick={() => removeOtherComment(i)} className="text-btn" style={{ color: '#ff4b4b' }}>削除</button>
            </div>
          ))}
          <div style={{ textAlign: 'right' }}>
            <button onClick={addOtherComment} className="text-btn" style={{ color: '#4bc8ff' }}>＋その他コメント追加</button>
          </div>
        </div>

        <button onClick={handleUpdate} className="submit-btn" style={{ width: '100%', fontSize: '1.1rem', padding: '12px' }}>更 新</button>

      </div>

      {showIconModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowIconModal(false)}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 className="cyber-title" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#4bc8ff' }}>顔グラフィック一覧</h3>
            <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1rem' }}>任意の画像をクリックすると、その顔がキャラクターの顔になります。<br/>他のプレイヤーによってすでに使われている画像は選択できません。</div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {icons.map(icon => (
                <div 
                  key={icon.filename} 
                  style={{ 
                    width: '80px', height: '80px', border: formData.icon === icon.filename ? '2px solid #4facfe' : '1px solid #444', 
                    opacity: icon.is_used && formData.icon !== icon.filename ? 0.3 : 1,
                    cursor: icon.is_used && formData.icon !== icon.filename ? 'not-allowed' : 'pointer',
                    position: 'relative'
                  }}
                  onClick={() => {
                    if (!icon.is_used || formData.icon === icon.filename) {
                      setFormData({ ...formData, icon: icon.filename });
                      setShowIconModal(false);
                    }
                  }}
                >
                  <img src={`/images/chara/${icon.filename}`} alt="face" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.currentTarget.src = '/images/no_image.png')} />
                  {icon.is_used && formData.icon !== icon.filename && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'red', fontWeight: 'bold', fontSize: '0.8rem', textShadow: '1px 1px 0 #000', whiteSpace: 'nowrap' }}>使用中</div>}
                </div>
              ))}
            </div>
            <button onClick={() => setShowIconModal(false)} className="text-btn" style={{ width: '100%', marginTop: '1.2rem', padding: '0.6rem', border: '1px solid #aaa', borderRadius: '4px' }}>閉じる</button>
          </div>
        </div>
      )}

    </div>
  );
};
