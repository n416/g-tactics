import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BattleAnimation, type BattleEvent, type BattleMeta } from '../components/BattleAnimation';
import './Register.css'; // Reusing cyber CSS

const skillList = [
  'ground', 'space', 'water', 'air',
  'melee', 'focus_fire', 'snipe', 'provoke',
  'focus', 'kamikaze', 'recover', 'counter'
];
// 原作 skill_max=12 は「特殊・NT除く」＝下記7系統のみを合算（msvs.cgi:177,838）。
// 特殊(挑発/集中/特攻/回復/反撃=1枠排他)は cap に数えない。
const SPECIAL_SKILLS = ['provoke', 'focus', 'kamikaze', 'recover', 'counter'];
const skillNameMap: Record<string, string> = {
  ground: '地形スキル(地上)', space: '地形スキル(宇宙)', water: '地形スキル(水中)', air: '地形スキル(空中)',
  melee: '格闘', focus_fire: '集中射撃', snipe: '精密射撃', provoke: '挑発',
  focus: '集中', kamikaze: '特攻', recover: '回復', counter: '反撃'
};

type Target = {
  id: string;
  handle_name: string;
  unit_name: string;
};

export const Simulator: React.FC = () => {
  const navigate = useNavigate();
  const [skillsObj, setSkillsObj] = useState<Record<string, number>>({});
  const [totalSkillLevel, setTotalSkillLevel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sysMsg, setSysMsg] = useState('');

  // Simulator Form State
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [terrain, setTerrain] = useState(1);

  // Battle Animation State
  const [battleData, setBattleData] = useState<{ events: BattleEvent[], meta: BattleMeta } | null>(null);

  const fetchMe = async () => {
    setLoading(true);
    const token = localStorage.getItem('gtactics_token');
    if (!token) { navigate('/'); return; }

    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await res.json()) as any;
      if (data.success && data.user) {
        // /api/me の user.skills は表示用文字列配列。忘却UIには生JSON(skills_raw)を使う。
        let sObj = {};
        try { sObj = JSON.parse(data.user.skills_raw || '{}'); } catch(e) {}
        setSkillsObj(sObj);
        
        let total = 0;
        for (const sName of skillList) {
          if (SPECIAL_SKILLS.includes(sName)) continue; // 特殊は skill_max 対象外
          if ((sObj as any)[sName]) total += (sObj as any)[sName];
        }
        setTotalSkillLevel(total);
      }

      // Fetch targets
      const targetsRes = await fetch('/api/battle/targets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const targetsData = (await targetsRes.json()) as any;
      if (targetsData.success) {
        setTargets(targetsData.targets);
        if (targetsData.targets.length > 0) {
          setTargetUserId(targetsData.targets[0].id);
        }
      }
    } catch (e) {
      console.error(e);
      setError('通信エラーが発生しました');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMe();
  }, [navigate]);

  const handleForget = async (skillName: string) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;

    try {
      const res = await fetch('/api/battle/forget-skill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ skill_name: skillName })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setSysMsg(data.message);
        setTimeout(() => setSysMsg(''), 3000);
        await fetchMe();
      } else {
        setError(data.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    }
  };

  const handleSimulate = async (e: React.FormEvent, isNpc: boolean) => {
    e.preventDefault();
    
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch('/api/battle/simulator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ target_user_id: isNpc ? '' : targetUserId, terrain })
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setBattleData({ events: data.events, meta: data.meta });
        if (data.requiresSkillForget) {
          // Will trigger Forget UI after refresh
        }
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('シミュレーションに失敗しました。');
    }
    setLoading(false);
  };

  if (battleData) {
    return <BattleAnimation events={battleData.events} meta={battleData.meta} onClose={() => {
      setBattleData(null);
      fetchMe(); // Refresh after battle
    }} />;
  }

  if (loading) return <div className="register-container"><div style={{color:'#00f2fe'}}>LOADING...</div></div>;

  return (
    <div className="register-container">
      <div className="glass-panel" style={{ maxWidth: '600px', width: '100%' }}>
        <h1 className="cyber-title" style={{ fontSize: '1.5rem', textAlign: 'center' }}>SIMULATOR</h1>
        <p style={{ textAlign: 'center', color: '#888', marginBottom: '2rem' }}>【模擬戦】</p>

        {sysMsg && <div style={{ background: 'rgba(72,187,120,0.2)', color: '#48bb78', padding: '10px', borderRadius: '4px', marginBottom: '1rem', textAlign: 'center', border: '1px solid #48bb78' }}>{sysMsg}</div>}
        {error && <div style={{ background: 'rgba(229,62,62,0.2)', color: '#fc8181', padding: '10px', borderRadius: '4px', marginBottom: '1rem', textAlign: 'center', border: '1px solid #fc8181' }}>{error}</div>}

        {totalSkillLevel > 12 ? (
          <div>
            <h2 style={{ color: '#fc8181', textAlign: 'center', marginBottom: '1rem' }}>スキル保有上限を超過しています</h2>
            <p style={{ color: '#fff', textAlign: 'center', marginBottom: '2rem' }}>
              スキルを多く覚えすぎました。スキル（レベル）を1つ忘れてください。<br/>
              現在の所持数: {totalSkillLevel} / 12
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {skillList.filter(sName => skillsObj[sName] > 0).map(sName => (
                <div key={sName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(0,0,0,0.5)', border: '1px solid #fc8181', borderRadius: '4px' }}>
                  <span style={{ color: '#fff' }}>{skillNameMap[sName]} (Lv.{skillsObj[sName]})</span>
                  <button onClick={() => handleForget(sName)} className="cyber-button" style={{ padding: '5px 15px', minWidth: '100px' }}>忘却する</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="input-group" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '4px' }}>
              <span style={{ color: '#aaa', fontSize: '0.9rem' }}>戦術は【戦術設定】で保存したものが使用されます</span>
              <button type="button" onClick={() => navigate('/tactics')} className="text-btn" style={{ fontSize: '0.85rem' }}>戦術設定へ</button>
            </div>

            <div className="input-group" style={{ marginBottom: '2rem' }}>
              <label>地形</label>
              <select value={terrain} onChange={e => setTerrain(Number(e.target.value))} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid #00f2fe', borderRadius: '4px' }}>
                <option value={1}>地上</option>
                <option value={2}>水中</option>
                <option value={3}>宇宙</option>
                <option value={4}>空中</option>
              </select>
            </div>

            <div style={{ padding: '1.5rem', background: 'rgba(0,242,254,0.05)', border: '1px solid rgba(0,242,254,0.3)', borderRadius: '8px', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.2rem', color: '#00f2fe', marginBottom: '1rem', textAlign: 'center' }}>他キャラクターに挑戦</h2>
              <form onSubmit={e => handleSimulate(e, false)}>
                <div className="input-group" style={{ marginBottom: '1rem' }}>
                  <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid #00f2fe', borderRadius: '4px' }}>
                    <option value="">戦う相手を選択して下さい</option>
                    {targets.map(t => (
                      <option key={t.id} value={t.id}>{t.handle_name} ({t.unit_name || '無所属'})</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="cyber-button" style={{ width: '100%' }} disabled={!targetUserId}>
                  他キャラクターに挑戦
                </button>
              </form>
            </div>

            <div style={{ padding: '1.5rem', background: 'rgba(255,100,100,0.05)', border: '1px solid rgba(255,100,100,0.3)', borderRadius: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', color: '#ff6464', marginBottom: '1rem', textAlign: 'center' }}>シミュレーター</h2>
              <form onSubmit={e => handleSimulate(e, true)}>
                <button type="submit" className="cyber-button" style={{ width: '100%', border: '1px solid #ff6464', color: '#ff6464', textShadow: '0 0 5px rgba(255,100,100,0.5)' }}>
                  敵ＭＳと闘う
                </button>
              </form>
            </div>
            
            <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.8rem', marginTop: '1.5rem' }}>
              ※模擬戦では勝敗による賞金や名声の増減はありません。
            </p>
          </div>
        )}
        
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button type="button" onClick={() => navigate('/mypage')} className="cyber-button" style={{ background: 'transparent', border: '1px solid #00f2fe', color: '#00f2fe' }}>
            マイページに戻る
          </button>
        </div>
      </div>
    </div>
  );
};
