import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css';
import { showChoice } from '../components/prompt'; 

export const Tournament: React.FC = () => {
  const getRemainingTimeFormat = (createdAt: string) => {
    if (!createdAt) return '';
    // SQLite DATETIME: YYYY-MM-DD HH:MM:SS (UTC)
    const created = new Date(createdAt.replace(' ', 'T') + 'Z');
    const now = new Date();
    const diff = (created.getTime() + 14 * 24 * 60 * 60 * 1000) - now.getTime();
    if (diff <= 0) return '000000';
    const dd = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hh = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mm = Math.floor((diff / 1000 / 60) % 60);
    return `${String(dd).padStart(2, '0')}${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`;
  };

  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 大会作成用ステート
  const [showCreate, setShowCreate] = useState(false);
  const [tName, setTName] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tPrize, setTPrize] = useState(0);
  const [tEntry, setTEntry] = useState(0);
  const [tLimit, setTLimit] = useState(16);
  const [tFormat, setTFormat] = useState(0);
  const [tHeal, setTHeal] = useState(false);
  const [tLimitCost, setTLimitCost] = useState(0);
  const [tLimitCostJyo, setTLimitCostJyo] = useState(0);
  const [tLimitRank, setTLimitRank] = useState(0);
  const [tLimitRankJyo, setTLimitRankJyo] = useState(0);
  const [tLimitCustom, setTLimitCustom] = useState(0);
  const [tAutoStart, setTAutoStart] = useState('');
  const [tTeamLeader, setTTeamLeader] = useState(false);
  const [tTeamTactics, setTTeamTactics] = useState(false);
  const [tLimitLv, setTLimitLv] = useState(0);
  const [tLimitLvJyo, setTLimitLvJyo] = useState(0);
  const [tLimitTaikyu, setTLimitTaikyu] = useState(0);
  const [tLimitTaikyuJyo, setTLimitTaikyuJyo] = useState(0);
  const [tMask, setTMask] = useState(0);
  // 開催地形（原作: 主催者が作成時に選択）。-2=ランダム（開始時に抽選して確定）
  const [tTerrain, setTTerrain] = useState(-2);

  // P33/P39: 大会形式（原作 trmnt_setei.cgi:125-140）
  const FORMAT_NAMES = ['トーナメント', 'バトルロイヤル', 'シャッフルトーナメント', '団体総力戦'];
  const TERRAIN_NAMES: Record<number, string> = { 1: '地上', 2: '水中', 3: '宇宙', 4: '空中', 5: '仮想空間' };

  let currentUserId = '';
  const token = localStorage.getItem('gtactics_token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      currentUserId = payload.id;
    } catch(e) {}
  }

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      const response = await fetch('/api/tournaments');
      const data = (await response.json()) as any;
      if (data.success) {
        setTournaments(data.tournaments);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('大会データの取得に失敗しました');
    }
  };

  const handleEntry = async (tournamentId: number) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) {
      // alert は使わずに独自UI等を使うべきだが、今回は移行時の互換として一時的に残すか、Consoleで対応する
      console.log('ログインが必要です');
      navigate('/');
      return;
    }

    // P33: 団体総力戦は陣営(1/2)を選んでエントリー。
    // 以前は window.prompt で「1 または 2」を手入力させ、範囲外なら弾いていた。
    // 二択なので、そのまま押せるようにする（入力ミスという概念自体が無くなる）。
    const target = tournaments.find(t => t.id === tournamentId);
    let side: number | undefined;
    if (target && Number(target.format) === 3) {
      const picked = await showChoice(
        'この大会は団体総力戦です。どちらの陣営で参加しますか？',
        [
          { value: '1', label: '第1陣営' },
          { value: '2', label: '第2陣営' },
        ],
        { title: '所属陣営を選ぶ' }
      );
      if (picked === null) return;
      side = Number(picked);
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/entry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(side ? { side } : {})
      });
      const data = (await response.json()) as any;
      
      if (data.success) {
        setMessage(data.message);
        fetchTournaments(); // 更新
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('エントリーに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 管理者用：大会の実行
  const handleExecute = async (tournamentId: number) => {
    setLoading(true);
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/execute`, {
        method: 'POST'
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage('大会が終了しました！');
        fetchTournaments();
      } else {
        setError(data.message);
      }
    } catch(err) {
      setError('実行エラー');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (tournamentId: number) => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage('大会を取り下げました。賞金が返還されました。');
        fetchTournaments();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('取り下げに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTournament = async () => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) {
      setError('ログインが必要です');
      return;
    }
    if (!tName) {
      setError('大会名を入力してください');
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`/api/tournaments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
                body: JSON.stringify({
          name: tName,
          description: tDesc,
          prize_money: tPrize,
          entry_fee: tEntry,
          participant_limit: tLimit,
          format: tFormat,
          heal_between: tHeal,
          limit_cost: tLimitCost,
          limit_cost_jyo: tLimitCostJyo,
          limit_rank: tLimitRank,
          limit_rank_jyo: tLimitRankJyo,
          limit_custom: tLimitCustom,
          limit_lv: tLimitLv,
          limit_lv_jyo: tLimitLvJyo,
          limit_taikyu: tLimitTaikyu,
          limit_taikyu_jyo: tLimitTaikyuJyo,
          auto_start_time: tAutoStart,
          team_leader: tTeamLeader ? 1 : 0,
          team_tactics: tTeamTactics ? 1 : 0,
          participant_mask: tMask,
          field_terrain: tTerrain,
        })
      });
      const data = (await response.json()) as any;
      if (data.success) {
        setMessage('大会を開催しました！');
        setError('');
        setTName('');
        setTDesc('');
        setTPrize(0);
        setTEntry(0);
        setTLimit(16);
        setShowCreate(false);
        fetchTournaments();
      } else {
        setError(data.message);
        setMessage('');
      }
    } catch (err) {
      setError('通信エラーが発生しました');
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status: number) => {
    switch(status) {
      case 0: return <span style={{ color: 'var(--accent-color)' }}>受付中</span>;
      case 1: return <span style={{ color: 'var(--accent-color)' }}>進行中</span>;
      case 2: return <span style={{ color: 'var(--text-secondary)' }}>終了</span>;
      default: return '不明';
    }
  };

  return (
    <div className="register-container" style={{ padding: '2rem 1rem' }}>
      <div className="glass-panel" style={{ maxWidth: '900px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>TOURNAMENT CENTER</h1>
          <button onClick={() => navigate('/mypage')} className="text-btn">RETURN TO BASE</button>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          各地で開催される優勝戦（大会）にエントリーし、強敵と戦って賞金と名声を獲得しましょう。<br/>
          ※エントリー後、大会の規定時刻になると自動的に戦闘が行われます。
        </p>

        {error && <div className="error-message" style={{marginBottom: '1rem'}}>{error}</div>}
        {message && <div className="success-message" style={{marginBottom: '1rem', color: 'var(--accent-color)'}}>{message}</div>}

        <div style={{ marginBottom: '1.5rem' }}>
          <button onClick={() => setShowCreate(!showCreate)} className="submit-btn" style={{ padding: '0.5rem 1rem' }}>
            {showCreate ? '閉じる' : '自分で大会を主催する'}
          </button>
        </div>

        {showCreate && (
          <div className="premium-glass-panel" style={{ marginBottom: '2rem' }}>
            <h2 className="cyber-title" style={{ fontSize: '1.4rem', marginBottom: '0.5rem', color: 'var(--accent-color)', textAlign: 'left' }}>
              <span style={{ marginRight: '0.5rem' }}>⚔️</span>HOST A TOURNAMENT
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.6' }}>
              プレイヤー主催の大会を作成します。設定した「優勝賞金」分が即座にあなたの所持金から引き落とされます。<br/>
              人が集まらない場合は取り下げることで全額返還されます。
            </p>
            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">大会名 <span style={{ color: 'var(--accent-color)' }}>*</span></label>
                <input type="text" className="cyber-input" value={tName} onChange={e => setTName(e.target.value)} placeholder="例：初心者歓迎トーナメント" />
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">参加定員</label>
                <input type="number" className="cyber-input" value={tLimit} onChange={e => setTLimit(Number(e.target.value))} min={2} />
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">大会形式</label>
                <select className="cyber-input" value={tFormat} onChange={e => setTFormat(Number(e.target.value))}>
                  <option value={0}>トーナメント（組み合わせは登録順）</option>
                  <option value={1}>バトルロイヤル（全員乱戦の生き残り戦）</option>
                  <option value={2}>シャッフルトーナメント（毎回戦組み合わせ抽選）</option>
                  <option value={3}>団体総力戦（陣営1 vs 陣営2）</option>
                </select>
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={tHeal} onChange={e => setTHeal(e.target.checked)} />
                  １戦毎の恢復あり（トーナメント/シャッフルのみ）
                </label>
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">搭乗者 熟練度制限</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="number" className="cyber-input" value={tLimitLv} onChange={e => setTLimitLv(Number(e.target.value))} min={0} />
                  <select className="cyber-input" value={tLimitLvJyo} onChange={e => setTLimitLvJyo(Number(e.target.value))}>
                    <option value={0}>自由</option>
                    <option value={1}>以上</option>
                    <option value={-1}>以下</option>
                  </select>
                </div>
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">機体 耐久制限</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="number" className="cyber-input" value={tLimitTaikyu} onChange={e => setTLimitTaikyu(Number(e.target.value))} min={0} />
                  <select className="cyber-input" value={tLimitTaikyuJyo} onChange={e => setTLimitTaikyuJyo(Number(e.target.value))}>
                    <option value={0}>自由</option>
                    <option value={1}>以上</option>
                    <option value={-1}>以下</option>
                  </select>
                </div>
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">搭乗者 ランク制限</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="number" className="cyber-input" value={tLimitRank} onChange={e => setTLimitRank(Number(e.target.value))} min={0} />
                  <select className="cyber-input" value={tLimitRankJyo} onChange={e => setTLimitRankJyo(Number(e.target.value))}>
                    <option value={0}>自由</option>
                    <option value={1}>以上</option>
                    <option value={-1}>以下</option>
                  </select>
                </div>
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">機体・搭乗者 コスト制限</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="number" className="cyber-input" value={tLimitCost} onChange={e => setTLimitCost(Number(e.target.value))} min={0} />
                  <select className="cyber-input" value={tLimitCostJyo} onChange={e => setTLimitCostJyo(Number(e.target.value))}>
                    <option value={0}>自由</option>
                    <option value={1}>以上</option>
                    <option value={-1}>以下</option>
                  </select>
                </div>
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">カスタマイズ機体</label>
                <select className="cyber-input" value={tLimitCustom} onChange={e => setTLimitCustom(Number(e.target.value))}>
                  <option value={0}>可</option>
                  <option value={1}>不可（無改造機のみ）</option>
                </select>
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">自動開催時刻（空欄=手動開催）</label>
                <input type="datetime-local" className="cyber-input" value={tAutoStart} onChange={e => setTAutoStart(e.target.value)} />
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">開催地形</label>
                <select className="cyber-input" value={tTerrain} onChange={e => setTTerrain(Number(e.target.value))}>
                  <option value={-2}>ランダム（開始時に決定）</option>
                  <option value={1}>地上</option>
                  <option value={2}>水中</option>
                  <option value={3}>宇宙</option>
                  <option value={4}>空中</option>
                  <option value={5}>仮想空間</option>
                </select>
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">参加者表示選択</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', height: '100%', fontSize: '0.9rem' }}>
                  <label><input type="radio" name="tmask" value={0} checked={tMask === 0} onChange={() => setTMask(0)} /> 表示</label>
                  <label><input type="radio" name="tmask" value={1} checked={tMask === 1} onChange={() => setTMask(1)} /> 内容非表示</label>
                  <label><input type="radio" name="tmask" value={2} checked={tMask === 2} onChange={() => setTMask(2)} /> 完全非表示</label>
                </div>
              </div>
              {tFormat === 3 && (
                <div className="cyber-input-wrapper" style={{ gridColumn: '1 / -1', display: 'flex', gap: '2rem' }}>
                  <label className="cyber-label" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="checkbox" checked={tTeamLeader} onChange={e => setTTeamLeader(e.target.checked)} />
                    リーダーあり（団体総力戦）
                  </label>
                  <label className="cyber-label" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="checkbox" checked={tTeamTactics} onChange={e => setTTeamTactics(e.target.checked)} />
                    団体戦術あり（団体総力戦）
                  </label>
                </div>
              )}
              <div className="cyber-input-wrapper" style={{ gridColumn: '1 / -1' }}>
                <label className="cyber-label">説明・宣伝文句</label>
                <textarea className="cyber-input" value={tDesc} onChange={e => setTDesc(e.target.value)} rows={3} placeholder="アピールポイントなどを記入" />
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label accent">優勝賞金 (所持金から引落)</label>
                <input type="number" className="cyber-input accent" value={tPrize} onChange={e => setTPrize(Number(e.target.value))} min={0} />
              </div>
              <div className="cyber-input-wrapper">
                <label className="cyber-label">参加費 (プレイヤー負担)</label>
                <input type="number" className="cyber-input" value={tEntry} onChange={e => setTEntry(Number(e.target.value))} min={0} />
              </div>
            </div>
            <button className="cyber-button-primary cyber-button-accent" onClick={handleCreateTournament} disabled={loading}>
              この設定で開催する (賞金引落)
            </button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-primary)' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.1)', textAlign: 'left' }}>
                <th style={{ padding: '1rem' }}>大会名</th>
                <th style={{ padding: '1rem' }}>状態</th>
                <th style={{ padding: '1rem' }}>参加費</th>
                <th style={{ padding: '1rem' }}>優勝賞金</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>アクション</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--accent-color)', fontSize: '1.1rem' }}>
                      {t.name}
                      {t.status === 0 && (
                        <span style={{ marginLeft: '0.5rem', color: 'rgba(255, 255, 255, 0.3)', fontSize: '0.8rem', fontWeight: 'normal' }}>
                          {getRemainingTimeFormat(t.created_at)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>【形式】{FORMAT_NAMES[Number(t.format) || 0]}{t.heal_between ? '・１戦毎恢復' : ''}　【地形】{TERRAIN_NAMES[Number(t.field_terrain)] || 'ランダム'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.description}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>{getStatusText(t.status)}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{t.entry_fee} G</td>
                  <td style={{ padding: '1rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>{t.prize_money} G</td>
                  <td style={{ padding: '1rem', textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    {t.status === 0 && (
                      <button 
                        onClick={() => handleEntry(t.id)}
                        disabled={loading}
                        className="submit-btn"
                        style={{ padding: '0.5rem 1rem', margin: 0, flex: 1 }}
                      >
                        エントリー
                      </button>
                    )}
                    {t.status === 0 && (
                       <button onClick={() => handleExecute(t.id)} className="text-btn" style={{ color: 'var(--accent-color)' }}>
                         [EXEC]
                       </button>
                    )}
                    {t.status === 0 && t.host_id === currentUserId && (
                       <button onClick={() => handleCancel(t.id)} className="text-btn" style={{ color: 'var(--accent-color)', border: '1px solid var(--accent-color)' }}>
                         取消
                       </button>
                    )}
                    <button 
                      onClick={() => navigate(`/tournament/${t.id}`)}
                      className="text-btn"
                      style={{ padding: '0.5rem 1rem', margin: 0, flex: 1, border: '1px solid var(--border-color)' }}
                    >
                      詳細 / 結果
                    </button>
                  </td>
                </tr>
              ))}
              {tournaments.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    現在開催されている大会はありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


