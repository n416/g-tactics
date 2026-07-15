import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; // Reusing the cyber CSS

export const Training: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');
  const [sysMsg, setSysMsg] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [wazaType, setWazaType] = useState<number>(0);
  const [wazaName, setWazaName] = useState<string>('');
  const [traitName, setTraitName] = useState<string>('豪胆');
  const [addLv, setAddLv] = useState<number>(1);
  const [reduceStatus, setReduceStatus] = useState<string>('intuition');

  const [trainStat, setTrainStat] = useState<string>('intuition');
  const [trainCourse, setTrainCourse] = useState<'normal'|'enhanced'>('normal');
  const [trainKaisu, setTrainKaisu] = useState<number>(1);
  const [baimeiKaisu, setBaimeiKaisu] = useState<number>(1);

  const fetchMe = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) { navigate('/'); return; }
    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setUser(data.user);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMe();
  }, [navigate]);

  const handleAwaken = async (type: 'nt' | 'cyber') => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;

    try {
      const res = await fetch('/api/training/awaken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ awaken_type: type })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        fetchMe();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    }

    setTimeout(() => {
      setSysMsg('');
      setError('');
    }, 4000);
  };

  const handleExchange = async (type: 'baimei' | 'meiseiuri') => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/training/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: type === 'baimei' ? JSON.stringify({ kaisu: baimeiKaisu }) : undefined
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        fetchMe();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    }

    setTimeout(() => {
      setSysMsg('');
      setError('');
    }, 4000);
  };

  const handleDevelopTrait = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const res = await fetch('/api/training/develop_trait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ trait_name: traitName, add_lv: addLv })
      });
      const data = (await res.json()) as any;
      if (data.success) { setSysMsg(data.message); fetchMe(); } else { setError(data.message); }
    } catch(e) { setError('通信エラー'); }
  };
  const handleResetTraits = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const res = await fetch('/api/training/reset_traits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await res.json()) as any;
      if (data.success) { setSysMsg(data.message); fetchMe(); } else { setError(data.message); }
    } catch(e) { setError('通信エラー'); }
  };
  const handleReduceStatus = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const res = await fetch('/api/training/reduce_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status_type: reduceStatus })
      });
      const data = (await res.json()) as any;
      if (data.success) { setSysMsg(data.message); fetchMe(); } else { setError(data.message); }
    } catch(e) { setError('通信エラー'); }
  };

  const handleWazaGet = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;

    try {
      const res = await fetch('/api/training/wazaget', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: wazaType, name: wazaName })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        setWazaName('');
        fetchMe();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    }

    setTimeout(() => {
      setSysMsg('');
      setError('');
    }, 4000);
  };

  const handleTraining = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      // profileApp は /api 直下マウント（index.ts）のため /api/training が正
      const res = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ stat_type: trainStat, course: trainCourse, kaisu: trainKaisu })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        const messagesSuccess = ["大変よろしい。前回よりも強くなったな。", "噂通りの腕前だな。素晴らしい！", "まぁ、こんなものではないかな。", "ふむ、これだけやって、やっとか・・・。"];
        const messagesFail = ["そんな腕前で合格させる訳にはいかん！", "当機関も暇ではないのだよ。無駄な時間を取らせないでくれたまえ。", "装置が故障するとは・・・。調整が必要か。", "体調でも悪いのかな？　ふむ。それとも実力か。"];
        const doctorMsg = data.seiko > 0 
          ? messagesSuccess[Math.floor(Math.random() * messagesSuccess.length)]
          : messagesFail[Math.floor(Math.random() * messagesFail.length)];
        setSysMsg(data.message + " 「" + doctorMsg + "」");
        fetchMe();
      } else {
        setError(data.message);
      }
    } catch(e) { setError('通信エラー'); }
    setTimeout(() => { setSysMsg(''); setError(''); }, 4000);
  };

  const handleSuppress = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    try {
      const res = await fetch('/api/training/suppress', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await res.json()) as any;
      if (data.success) { setSysMsg(data.message); fetchMe(); } else { setError(data.message); }
    } catch(e) { setError('通信エラー'); }
    setTimeout(() => { setSysMsg(''); setError(''); }, 4000);
  };

  if (loading) return <div className="register-container"><div style={{color:'#00f2fe'}}>LOADING...</div></div>;
  if (!user) return null;

  const nyu_kin = 5000 + Math.abs(user.nt_level || 0) * 1000;
  // 訓練・強化の費用/Limit表示（training.cgi traincalc:838-866 と同式。判定はサーバーが正）
  const sum5 = user.status_intuition + user.status_piloting + user.status_short_range + user.status_mid_range + user.status_long_range;
  const upOver240 = sum5 > 6000 ? sum5 * 2 - 6000 : sum5 > 1200 ? sum5 - 1000 : 0;
  const trainStatVal = user[`status_${trainStat}`] || 0;
  const trainCostPer = trainCourse === 'normal'
    ? Math.max(1, Math.trunc((trainStatVal * trainStatVal) / (Math.max(1, user.level) * 4)) + upOver240)
    : Math.min(Math.max(1, user.level), 10) * 100;
  const trainLimit = Math.max(0, 17 - Math.trunc(trainStatVal / 10));
  const canAwaken = user.level >= 10 &&
                    user.status_intuition >= 20 && 
                    user.status_piloting >= 20 && 
                    user.status_short_range >= 20 && 
                    user.status_mid_range >= 20 && 
                    user.status_long_range >= 20;

  return (
    <div className="register-container">
      <div className="glass-panel" style={{ maxWidth: '800px', width: '100%' }}>
        <h1 className="cyber-title" style={{ fontSize: '1.5rem', textAlign: 'center' }}>NEWTYPE LAB</h1>
        <p style={{ textAlign: 'center', color: '#888', marginBottom: '2rem' }}>【フラナガン機関 / ニュータイプ研究所】</p>

        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', alignItems: 'center' }}>
          <div style={{ flex: '0 0 100px', height: '100px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #00f2fe' }}>
            <span style={{ fontSize: '0.8rem', color: '#00f2fe' }}>Dr. Flanagan</span>
          </div>
          <div style={{ flex: '1', background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #00f2fe' }}>
            {canAwaken ? (
              user.nt_level === 0 ? (
                <>
                  <p style={{ color: '#fff', marginBottom: '0.5rem' }}>「君はさらに強くなりたいのだね。ただし、それには条件がある。」</p>
                  <p style={{ color: '#aaa', fontSize: '0.9rem' }}>※ 必要な資金: {nyu_kin}G</p>
                  <p style={{ color: '#aaa', fontSize: '0.9rem' }}>「この条件でよければ、協力しよう。」</p>
                </>
              ) : (
                <>
                  <p style={{ color: '#fff', marginBottom: '0.5rem' }}>「さらに能力の極致へ向かいたいのだな。」</p>
                  <p style={{ color: '#aaa', fontSize: '0.9rem' }}>※ 必要な資金: {nyu_kin}G</p>
                </>
              )
            ) : (
              <>
                <p style={{ color: '#fff', marginBottom: '0.5rem' }}>「ここの施設を真に利用するには、熟練度（Lv.10以上）か、全ステータス（20以上）が足りないようだな。」</p>
                <p style={{ color: '#aaa', fontSize: '0.9rem' }}>（現在のLv: {user.level}, 所持金: {user.money}G）</p>
              </>
            )}
          </div>
        </div>

        {sysMsg && <div style={{ background: 'rgba(72,187,120,0.2)', color: '#48bb78', padding: '10px', borderRadius: '4px', marginBottom: '1rem', textAlign: 'center', border: '1px solid #48bb78' }}>{sysMsg}</div>}
        {error && <div style={{ background: 'rgba(229,62,62,0.2)', color: '#fc8181', padding: '10px', borderRadius: '4px', marginBottom: '1rem', textAlign: 'center', border: '1px solid #fc8181' }}>{error}</div>}

        <div className="stats-allocation" style={{ marginTop: 0, marginBottom: '2rem' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>現在の覚醒状態</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>タイプ</div>
              <div style={{ fontSize: '1.2rem', color: user.nt_level > 0 ? '#4facfe' : user.nt_level < 0 ? '#e53e3e' : '#fff', fontWeight: 'bold' }}>
                {user.nt_level > 0 ? 'ニュータイプ (NT)' : user.nt_level < 0 ? '強化人間' : 'オールドタイプ (未覚醒)'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>覚醒レベル</div>
              <div style={{ fontSize: '1.2rem', color: '#fff', fontWeight: 'bold' }}>
                {Math.abs(user.nt_level)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>所持金</div>
              <div style={{ fontSize: '1.2rem', color: '#ecc94b', fontWeight: 'bold' }}>
                {user.money.toLocaleString()} G
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>名声</div>
              <div style={{ fontSize: '1.2rem', color: '#ecc94b', fontWeight: 'bold' }}>
                {user.fame || 0}
              </div>
            </div>
          </div>
        </div>

        {canAwaken && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
            {user.nt_level >= 0 && user.nt_level < 5 && (
              <div style={{ background: 'rgba(79, 172, 254, 0.1)', border: '1px solid #4facfe', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
                <h3 style={{ color: '#4facfe', marginBottom: '1rem' }}>ニュータイプ覚醒</h3>
                <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '1rem', minHeight: '40px' }}>
                  天性の直感と空間認識能力に目覚めます。特定のサイコミュ兵装を扱えるようになり、機体の索敵能力に補正がかかります。
                </p>
                <button 
                  onClick={() => handleAwaken('nt')}
                  disabled={user.money < nyu_kin}
                  className="submit-btn" 
                  style={{ width: '100%', background: user.money >= nyu_kin ? '#4facfe' : '#555', color: 'white', margin: 0 }}
                >
                  {user.money >= nyu_kin ? `覚醒する (${nyu_kin}G)` : '資金不足'}
                </button>
              </div>
            )}

            {user.nt_level <= 0 && user.nt_level > -7 && (
              <div style={{ background: 'rgba(229, 62, 62, 0.1)', border: '1px solid #e53e3e', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
                <h3 style={{ color: '#e53e3e', marginBottom: '1rem' }}>強化人間手術</h3>
                <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '1rem', minHeight: '40px' }}>
                  薬物と暗示により人工的にニュータイプ能力を引き出します。強力な戦闘力を得ますが、精神的リスク（暴走など）を伴います。
                </p>
                <button 
                  onClick={() => handleAwaken('cyber')}
                  disabled={user.money < nyu_kin}
                  className="submit-btn" 
                  style={{ width: '100%', background: user.money >= nyu_kin ? '#e53e3e' : '#555', color: 'white', margin: 0 }}
                >
                  {user.money >= nyu_kin ? `手術を受ける (${nyu_kin}G)` : '資金不足'}
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid #444', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
          <h3 style={{ color: '#fff', marginBottom: '1rem', borderBottom: '1px solid #444', paddingBottom: '0.5rem' }}>訓練・強化</h3>
          <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
            費用: {trainCostPer.toLocaleString()}pt × {trainKaisu}回 = {(trainCostPer * trainKaisu).toLocaleString()}pt（成否問わず消費）
            {trainCourse === 'enhanced' && <>　【Limit:{trainLimit}回】</>}
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '120px' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.3rem' }}>能力</label>
              <select className="register-input" style={{ width: '100%', margin: 0, padding: '10px' }} value={trainStat} onChange={(e) => setTrainStat(e.target.value)}>
                <option value="intuition">直感</option>
                <option value="piloting">操縦</option>
                <option value="short_range">近距離</option>
                <option value="mid_range">中距離</option>
                <option value="long_range">遠距離</option>
              </select>
            </div>
            <div style={{ flex: '1', minWidth: '120px' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.3rem' }}>コース</label>
              <select className="register-input" style={{ width: '100%', margin: 0, padding: '10px' }} value={trainCourse} onChange={(e) => setTrainCourse(e.target.value as 'normal'|'enhanced')}>
                <option value="normal">通常訓練 (+1)</option>
                <option value="enhanced">特別強化 (+10)</option>
              </select>
            </div>
            <div style={{ flex: '1', minWidth: '80px' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.3rem' }}>回数</label>
              <select className="register-input" style={{ width: '100%', margin: 0, padding: '10px' }} value={trainKaisu} onChange={(e) => setTrainKaisu(Number(e.target.value))}>
                {[...Array(10)].map((_, i) => <option key={i+1} value={i+1}>{i+1}回</option>)}
              </select>
            </div>
            <div style={{ flex: '1', minWidth: '150px', alignSelf: 'flex-end' }}>
              <button onClick={handleTraining} disabled={user.money < trainCostPer * trainKaisu || (trainCourse === 'enhanced' && trainStatVal >= 170)} className="submit-btn" style={{ width: '100%', background: (user.money >= trainCostPer * trainKaisu && !(trainCourse === 'enhanced' && trainStatVal >= 170)) ? '#48bb78' : '#555', color: '#fff', margin: 0, padding: '10px' }}>訓練・強化</button>
            </div>
          </div>
        </div>

        {user.awakening_suppressed === 0 && (
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid #444', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem', borderBottom: '1px solid #444', paddingBottom: '0.5rem' }}>覚醒抑止</h3>
            <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
              「君は覚醒を防ぎたいのだね。凡人になりたいとは酔狂なことだ。」（費用: {5000 + Math.abs(user.nt_level) * 1000}pt）<br/>
              ※ 覚醒を抑止すると技術習得が可能になります。{user.nt_level !== 0 && '現在の覚醒状態（NT/強化人間）は失われます。'}
            </p>
            <button onClick={handleSuppress} disabled={user.money < (5000 + Math.abs(user.nt_level) * 1000)} className="submit-btn" style={{ width: '100%', background: user.money >= (5000 + Math.abs(user.nt_level) * 1000) ? '#e53e3e' : '#555', color: 'white', margin: 0 }}>
              覚醒を抑止する
            </button>
          </div>
        )}

        {user.awakening_suppressed === 1 && (
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid #444', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem', borderBottom: '1px solid #444', paddingBottom: '0.5rem' }}>オールドタイプ専用 技の習得</h3>
            <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
              己の肉体と機体のみを信じるオールドタイプだけが習得できる特別な技術です。（習得費用: 5000G）<br/>
              ※ 新しい技を習得すると、以前の技は上書きされます。
            </p>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', minWidth: '150px' }}>
                <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.3rem' }}>技の種類</label>
                <select 
                  className="register-input" 
                  style={{ width: '100%', margin: 0, padding: '10px' }}
                  value={wazaType} 
                  onChange={(e) => setWazaType(parseInt(e.target.value, 10))}
                >
                  <option value={0}>必殺技（攻撃力・命中アップ）</option>
                  <option value={1}>回避（完全回避の確率付与）</option>
                  <option value={2}>麻痺（相手を行動不能に）</option>
                  <option value={3}>連続ダメージ（継続ダメージ付与）</option>
                  <option value={4}>耐久力回復（毎ターンHP回復）</option>
                  <option value={5}>EN回復（毎ターンEN回復）</option>
                </select>
              </div>
              <div style={{ flex: '2', minWidth: '200px' }}>
                <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.3rem' }}>技の名前 (全角10文字以内)</label>
                <input 
                  type="text" 
                  className="register-input" 
                  style={{ width: '100%', margin: 0, padding: '10px' }}
                  placeholder="例: 超究武神覇斬" 
                  maxLength={10}
                  value={wazaName} 
                  onChange={(e) => setWazaName(e.target.value)} 
                />
              </div>
              <div style={{ flex: '1', minWidth: '150px', alignSelf: 'flex-end' }}>
                <button 
                  onClick={handleWazaGet}
                  disabled={user.money < 5000 || wazaName.trim() === ''}
                  className="submit-btn" 
                  style={{ width: '100%', background: (user.money >= 5000 && wazaName.trim() !== '') ? '#48bb78' : '#555', color: '#fff', margin: 0, padding: '10px' }}
                >
                  習得する
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid #444', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>寄付</h3>
            <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '1rem', minHeight: '40px' }}>
              「この研究所に寄付してくれて構わんぞ。」<br/>名声をランダムに獲得（0のことも）。
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', justifyContent: 'center' }}>
              <select className="register-input" style={{ width: '80px', margin: 0, padding: '10px' }} value={baimeiKaisu} onChange={(e) => setBaimeiKaisu(Number(e.target.value))}>
                {[...Array(5)].map((_, i) => <option key={i+1} value={i+1}>{i+1}回</option>)}
              </select>
            </div>
            <button 
              onClick={() => handleExchange('baimei')}
              disabled={user.money < 1000 * baimeiKaisu}
              className="submit-btn" 
              style={{ width: '100%', background: user.money >= 1000 * baimeiKaisu ? '#ecc94b' : '#555', color: '#000', margin: 0 }}
            >
              寄　付 ({1000 * baimeiKaisu}pt)
            </button>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid #444', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>売名</h3>
            <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '1rem', minHeight: '40px' }}>
              その名声を利用して資金を集めます。<br/>500〜2500Gをランダムに獲得できます。
            </p>
            <button 
              onClick={() => handleExchange('meiseiuri')}
              disabled={(user.fame || 0) < 50}
              className="submit-btn" 
              style={{ width: '100%', background: (user.fame || 0) >= 50 ? '#ecc94b' : '#555', color: '#000', margin: 0 }}
            >
              売　名 (名声50消費)
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid #444', padding: '1.5rem', borderRadius: '8px' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>特性開発室</h3>
            <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '1rem' }}>お金(1Lv=1000G)と名声(1Lv=10)を消費して特性を開発します。合計Lv上限=熟練度/2です。</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <select className="register-input" style={{ width: '100%', margin: 0, padding: '10px' }} value={traitName} onChange={e => setTraitName(e.target.value)}>
                <option value="豪胆">豪胆</option>
                <option value="短気">短気</option>
                <option value="手が早い">手が早い</option>
                <option value="機転が利く">機転が利く</option>
                <option value="気前がいい">気前がいい</option>
              </select>
              <input type="number" className="register-input" style={{ width: '80px', margin: 0, padding: '10px' }} value={addLv} min={1} max={10} onChange={e => setAddLv(Number(e.target.value))} />
            </div>
            <button onClick={handleDevelopTrait} className="submit-btn" style={{ width: '100%', background: '#48bb78', color: '#fff', margin: 0 }}>開発する</button>
            
            {user.level >= 30 && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid #444', paddingTop: '1rem' }}>
                <p style={{ fontSize: '0.8rem', color: '#fc8181', marginBottom: '0.5rem' }}>特性をすべて削除（無料）</p>
                <button onClick={handleResetTraits} className="submit-btn" style={{ width: '100%', background: '#e53e3e', color: '#fff', margin: 0 }}>すべて削除する</button>
              </div>
            )}
          </div>
          
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid #444', padding: '1.5rem', borderRadius: '8px' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>能力低減訓練</h3>
            <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '1rem' }}>伸びすぎたステータスを意図的に下げます。（返金なし）</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <select className="register-input" style={{ width: '100%', margin: 0, padding: '10px' }} value={reduceStatus} onChange={e => setReduceStatus(e.target.value)}>
                <option value="intuition">直感</option>
                <option value="piloting">操縦</option>
                <option value="short_range">近距離</option>
                <option value="mid_range">中距離</option>
                <option value="long_range">遠距離</option>
              </select>
            </div>
            <button onClick={handleReduceStatus} className="submit-btn" style={{ width: '100%', background: '#e53e3e', color: '#fff', margin: 0 }}>能力を1下げる</button>
          </div>
        </div>

        <button type="button" onClick={() => navigate('/mypage')} className="submit-btn" style={{ width: '100%', background: '#4a5568', color: 'white', padding: '12px', fontSize: '1.1rem', margin: 0 }}>
          マイページへ戻る
        </button>
      </div>
    </div>
  );
};
