import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css'; // We'll add this later if needed, or use index.css

const MAX_TOTAL_POINTS = 120;
const MAX_STAT_POINTS = 70;

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    id: '',
    password: '',
    handle_name: '',
    email: '',
    chara_name: '',
  });

  const [stats, setStats] = useState({
    intuition: 0,
    piloting: 0,
    short_range: 0,
    mid_range: 0,
    long_range: 0,
  });

  const [unitId, setUnitId] = useState<number>(0);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const totalPoints = Object.values(stats).reduce((a, b) => a + b, 0);
  const remainingPoints = MAX_TOTAL_POINTS - totalPoints;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStatChange = (statName: keyof typeof stats, value: number) => {
    // Determine the difference
    const diff = value - stats[statName];
    // Check if within bounds
    if (value >= 0 && value <= MAX_STAT_POINTS && remainingPoints - diff >= 0) {
      setStats({ ...stats, [statName]: value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (formData.id.length < 4 || formData.password.length < 4) {
      setError('IDとパスワードは4文字以上で入力してください。');
      return;
    }
    if (!formData.handle_name || !formData.chara_name) {
      setError('ハンドル名とキャラクター名は必須です。');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          status_intuition: stats.intuition,
          status_piloting: stats.piloting,
          status_short_range: stats.short_range,
          status_mid_range: stats.mid_range,
          status_long_range: stats.long_range,
          unit_id: unitId,
        }),
      });

      const data = (await response.json()) as any;
      if (data.success) {
        setSuccessMsg('キャラクターが作成されました！3秒後にホームへ戻ります。');
        setTimeout(() => {
          navigate('/');
        }, 3000);
      } else {
        setError(data.message || '登録に失敗しました。');
      }
    } catch (err) {
      console.error(err);
      setError('サーバーエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container" style={{ padding: '4rem 2rem' }}>
      <div className="glass-panel">
        <h1 className="cyber-title">CHARACTER CREATION</h1>
        <p className="subtitle">G-Tactics</p>

        {error && <div className="error-message">{error}</div>}
        {successMsg && <div className="success-message">{successMsg}</div>}

        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label>ID <span className="req">*</span></label>
            <input type="text" name="id" value={formData.id} onChange={handleInputChange} maxLength={32} placeholder="4文字以上の英数字" autoComplete="username" />
          </div>
          <div className="form-group">
            <label>パスワード <span className="req">*</span></label>
            <input type="password" name="password" value={formData.password} onChange={handleInputChange} maxLength={32} placeholder="4文字以上の英数字" autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label>ハンドルネーム <span className="req">*</span></label>
            <input type="text" name="handle_name" value={formData.handle_name} onChange={handleInputChange} placeholder="プレイヤー名" />
          </div>
          <div className="form-group">
            <label>メールアドレス</label>
            <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="任意" />
          </div>
          <div className="form-group">
            <label>キャラクター名 <span className="req">*</span></label>
            <input type="text" name="chara_name" value={formData.chara_name} onChange={handleInputChange} placeholder="ゲーム内キャラクター名" />
          </div>

          <div className="form-group">
            <label>初期ユニット <span className="req">*</span></label>
            <select 
              value={unitId} 
              onChange={(e) => setUnitId(Number(e.target.value))}
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.8rem 1rem',
                color: '#fff',
                fontSize: '1rem',
                outline: 'none',
              }}
            >
              <option style={{color: '#000'}} value={0}>ボール</option>
              <option style={{color: '#000'}} value={1}>ボール・カスタム</option>
              <option style={{color: '#000'}} value={2}>ザクI</option>
              <option style={{color: '#000'}} value={3}>ザクタンク</option>
            </select>
          </div>

          <div className="stats-allocation">
            <h3>STATUS ALLOCATION</h3>
            <div className="points-info">
              <span>残りポイント: </span>
              <span className={`points-remaining ${remainingPoints === 0 ? 'empty' : ''}`}>{remainingPoints}</span>
              <span> / {MAX_TOTAL_POINTS}</span>
            </div>

            <div className="stats-grid">
              {Object.keys(stats).map((key) => {
                const statKey = key as keyof typeof stats;
                const label = {
                  intuition: '直感',
                  piloting: '操縦',
                  short_range: '近距離',
                  mid_range: '中距離',
                  long_range: '長距離',
                }[statKey];

                return (
                  <div key={statKey} className="stat-row">
                    <label>{label}</label>
                    <div className="stat-controls">
                      <button type="button" onClick={() => handleStatChange(statKey, stats[statKey] - 1)} disabled={stats[statKey] <= 0}>-</button>
                      <input 
                        type="number" 
                        value={stats[statKey]} 
                        onChange={(e) => handleStatChange(statKey, parseInt(e.target.value) || 0)}
                        min={0}
                        max={MAX_STAT_POINTS}
                      />
                      <button type="button" onClick={() => handleStatChange(statKey, stats[statKey] + 1)} disabled={stats[statKey] >= MAX_STAT_POINTS || remainingPoints <= 0}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'PROCESSING...' : 'INITIALIZE CHARACTER'}
          </button>
          
          <div className="form-footer">
            <button type="button" className="text-btn" onClick={() => navigate('/')}>キャンセル</button>
          </div>
        </form>
      </div>
    </div>
  );
};
