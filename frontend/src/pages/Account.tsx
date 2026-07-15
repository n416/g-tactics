import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { showPrompt } from '../components/prompt';
import { showConfirm } from '../components/confirm';
import { showToast } from '../components/toast';
import './Register.css';
import './Account.css';

/* ============================================================
 * アカウント設定。ログインの手段と、キャラクターの削除だけを扱う。
 *
 * ゲーム側の設定（ランカー名・呼称・公開文・戦闘コメント・顔グラ）は
 * /profile-edit に置いてある。以前は両方が1画面に混在していた。
 *
 * 【ログイン方法を一覧で見せる理由】
 * 以前は「連携を解除」ボタンを disabled にして、小さな注記で理由を書いていた。
 * それでは伝わらない。そもそも Google だけで登録した人は、自分がパスワードを
 * 持っていないことを自覚していない（パスワードという概念に一度も出会っていない）。
 * 手段を並べて状態を見せれば、「パスワード＝未設定」「Google＝これだけ」が読める。
 * ============================================================ */

type Me = {
  id: string;
  handle_name: string;
  chara_name: string;
  google_linked: boolean;
  has_password: boolean;
};

export const Account: React.FC = () => {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // パスワード設定・変更のモーダル
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState('');

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('gtactics_token')}` });

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { headers: authHeaders() });
      const data = (await res.json()) as any;
      if (data.success) setMe(data.user);
      else navigate('/');
    } catch {
      setError('サーバーに接続できません');
    }
  }, [navigate]);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  /** 唯一のログイン手段かどうか。これを失うとアカウントに入れなくなる */
  const onlyGoogle = !!me && me.google_linked && !me.has_password;
  const onlyPassword = !!me && me.has_password && !me.google_linked;

  const handleLinkGoogle = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/google/link-start', { method: 'POST', headers: authHeaders() });
      const data = (await res.json()) as any;
      if (data.success && data.url) { window.location.href = data.url; return; }
      setError(data.message || 'Google 連携を開始できませんでした');
    } catch {
      setError('Google 連携を開始できませんでした');
    }
    setBusy(false);
  };

  const handleUnlinkGoogle = async () => {
    // パスワードが無い場合はサーバーが拒否するが、押す前に理由を伝える。
    // 「押したら怒られた」ではなく「押す前に分かる」状態にしたい。
    if (!me?.has_password) {
      const goSet = await showConfirm(
        'Google の連携を解除すると、ログインする手段が無くなります。\n\n先にパスワードを設定しますか？',
        { title: 'パスワードが未設定です', confirmLabel: 'パスワードを設定する', cancelLabel: 'やめる' }
      );
      if (goSet) setPwOpen(true);
      return;
    }

    const ok = await showConfirm(
      'Google アカウントの連携を解除します。以降はIDとパスワードでログインしてください。',
      { title: '連携を解除する', confirmLabel: '解除する' }
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch('/api/auth/google/unlink', { method: 'POST', headers: authHeaders() });
      const data = (await res.json()) as any;
      if (data.success) {
        showToast(data.message, 'success');
        await fetchMe();
      } else {
        setError(data.message);
      }
    } catch {
      setError('連携の解除に失敗しました');
    }
    setBusy(false);
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPw.length < 4) { setPwError('パスワードは4文字以上で入力してください'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        // パスワード未設定なら current_password は存在しないので送らない
        body: JSON.stringify(me?.has_password ? { current_password: currentPw, new_password: newPw } : { new_password: newPw }),
      });
      const data = (await res.json()) as any;
      if (data.success) {
        setPwOpen(false);
        setCurrentPw(''); setNewPw('');
        showToast(me?.has_password ? 'パスワードを変更しました' : 'パスワードを設定しました', 'success');
        await fetchMe();
      } else {
        setPwError(data.message);
      }
    } catch {
      setPwError('パスワードの保存に失敗しました');
    }
    setBusy(false);
  };

  const handleDelete = async () => {
    if (!me) return;
    const input = await showPrompt(
      `この操作は取り消せません。キャラクター・機体・戦績のすべてが消えます。\n\n続けるには、キャラクター名「${me.chara_name}」を入力してください。`,
      {
        title: 'キャラクターを削除する',
        placeholder: me.chara_name,
        requireMatch: me.chara_name,
        confirmLabel: '完全に削除する',
        danger: true,
      }
    );
    if (input === null) return;
    try {
      const res = await fetch('/api/delete-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ confirm_name: input }),
      });
      const data = (await res.json()) as any;
      if (data.success) {
        localStorage.removeItem('gtactics_token');
        navigate('/');
      } else {
        setError(data.message);
      }
    } catch {
      setError('削除処理に失敗しました');
    }
  };

  if (!me) {
    return <div className="register-container"><div style={{ color: 'var(--text-secondary)' }}>読み込み中…</div></div>;
  }

  return (
    <div className="register-container">
      <div className="glass-panel" style={{ maxWidth: '760px', width: '100%' }}>
        <div className="page-head">
          <h1 className="cyber-title" style={{ fontSize: '1.5rem', textAlign: 'left', marginBottom: 0 }}>アカウント設定</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ID: {me.id}</span>
        </div>

        {error && <div className="error-message">{error}</div>}

        <h2 className="account-section-title">ログイン方法</h2>
        <p className="account-section-note">
          このゲームにはパスワードの再設定メールがありません（メールアドレスを集めていないため）。
          <b>ログイン方法を2つにしておくと、片方を失っても入れます。</b>
        </p>

        <ul className="login-methods">
          {/* パスワード */}
          <li className={me.has_password ? 'on' : ''}>
            <span className="lm-icon" aria-hidden="true">🔑</span>
            <div className="lm-body">
              <b>パスワード</b>
              <span className={me.has_password ? 'lm-state on' : 'lm-state off'}>
                {me.has_password ? '設定済み' : '未設定'}
              </span>
              {onlyPassword && <span className="lm-warn">これが唯一のログイン方法です</span>}
            </div>
            <button className="submit-btn lm-action" onClick={() => setPwOpen(true)} disabled={busy}>
              {me.has_password ? '変更する' : '設定する'}
            </button>
          </li>

          {/* Google */}
          <li className={me.google_linked ? 'on' : ''}>
            <span className="lm-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </span>
            <div className="lm-body">
              <b>Google アカウント</b>
              <span className={me.google_linked ? 'lm-state on' : 'lm-state off'}>
                {me.google_linked ? '連携済み' : '未連携'}
              </span>
              {onlyGoogle && <span className="lm-warn">これが唯一のログイン方法です</span>}
            </div>
            <div className="lm-actions">
              {me.google_linked ? (
                <>
                  <button className="text-btn" onClick={handleLinkGoogle} disabled={busy}>別のアカウントに変更</button>
                  <button className="text-btn lm-danger" onClick={handleUnlinkGoogle} disabled={busy}>解除する</button>
                </>
              ) : (
                <button className="submit-btn lm-action" onClick={handleLinkGoogle} disabled={busy}>
                  {busy ? '接続中…' : '連携する'}
                </button>
              )}
            </div>
          </li>
        </ul>

        {/* 唯一の手段しか無い状態を、押される前に説明しておく。
          * 以前は解除ボタンを disabled にして小さく注記していたが、それでは伝わらない。 */}
        {(onlyGoogle || onlyPassword) && (
          <div className="account-alert">
            <b>⚠ ログイン方法が1つしかありません</b>
            <span>
              {onlyGoogle
                ? '今 Google の連携を解除すると、ログインする手段が無くなります。先にパスワードを設定してください（上の「設定する」から、現在のパスワードなしで設定できます）。'
                : 'パスワードを忘れると復旧できません。Google を連携しておくと、忘れた時でも入れます。'}
            </span>
          </div>
        )}

        <h2 className="account-section-title danger">キャラクターの削除</h2>
        <p className="account-section-note">
          キャラクター・機体・戦績のすべてが消えます。取り消せません。
        </p>
        <button className="submit-btn account-delete" onClick={handleDelete} disabled={busy}>
          キャラクターを削除する
        </button>
      </div>

      {/* パスワードの設定・変更 */}
      <Modal
        open={pwOpen}
        onClose={() => { setPwOpen(false); setPwError(''); }}
        title={me.has_password ? 'パスワードを変更する' : 'パスワードを設定する'}
        actions={
          <>
            <button className="text-btn" onClick={() => { setPwOpen(false); setPwError(''); }}>キャンセル</button>
            <button className="submit-btn" form="account-pw-form" type="submit" disabled={busy}>
              {me.has_password ? '変更する' : '設定する'}
            </button>
          </>
        }
      >
        <form id="account-pw-form" onSubmit={submitPassword}>
          {!me.has_password && (
            <p style={{ marginBottom: 'var(--space-4)', fontSize: '0.85rem' }}>
              今は Google だけでログインしています。パスワードを設定すると、Google が使えない時でも入れるようになります。
            </p>
          )}
          {/* パスワード未設定なら「現在のパスワード」は存在しない。
            * 訊いてしまうと、Google だけの人が永久に設定できず詰む。 */}
          {me.has_password && (
            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label>現在のパスワード</label>
              <input className="input-field" type="password" autoComplete="current-password"
                value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label>{me.has_password ? '新しいパスワード' : 'パスワード'}</label>
            <input className="input-field" type="password" autoComplete="new-password" placeholder="4文字以上"
              value={newPw} onChange={(e) => setNewPw(e.target.value)} autoFocus />
          </div>
          {pwError && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 'var(--space-2)' }}>{pwError}</div>}
        </form>
      </Modal>
    </div>
  );
};
