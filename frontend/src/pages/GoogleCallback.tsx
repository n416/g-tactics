import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../components/toast';
import './Register.css';

/* ============================================================
 * Google 認証からの着地点。
 *
 * Worker はここへリダイレクトし、結果をURLのハッシュに載せてくる。
 * ハッシュはサーバーにも Referer にも送られないので、トークンをクエリ文字列に
 * 載せるより漏れにくい。
 *
 *   #token=<JWT>      連携済みアカウント → そのままログイン
 *   #signup=<token>   未登録 → 登録画面へ引き継ぐ
 *   #linked=1         既存キャラへの連携が完了
 *   #error=<code>     失敗
 *
 * 画面としては素通りするだけなので、何も見せずに次へ飛ばす。
 * ============================================================ */

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'Google での認証をキャンセルしました。',
  bad_state: '認証の有効期限が切れました。もう一度お試しください。',
  exchange_failed: 'Google との通信に失敗しました。時間をおいてお試しください。',
  already_linked: 'この Google アカウントは既に別のキャラクターで使われています。',
  start_failed: '認証を開始できませんでした。',
  server_error: 'サーバーエラーが発生しました。',
};

export const GoogleCallback: React.FC = () => {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    // StrictMode の二重実行で signup トークンを2回消費しないようにする
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    // 認証情報を履歴に残さない
    window.history.replaceState(null, '', '/auth/google');

    const token = params.get('token');
    const signup = params.get('signup');
    const linked = params.get('linked');
    const error = params.get('error');

    if (token) {
      localStorage.setItem('gtactics_token', token);
      navigate('/mypage', { replace: true });
      return;
    }

    if (signup) {
      // トークンは URL ではなく router の state で渡す（履歴にも Referer にも残さない）
      navigate('/register', { replace: true, state: { googleToken: signup } });
      return;
    }

    if (linked) {
      showToast('Google アカウントを連携しました', 'success');
      navigate('/mypage', { replace: true });
      return;
    }

    showToast(ERROR_MESSAGES[error ?? ''] ?? '認証に失敗しました。', 'error');
    // 連携の失敗ならログイン中なのでマイページへ、それ以外はログイン画面へ
    navigate(localStorage.getItem('gtactics_token') ? '/mypage' : '/', { replace: true });
  }, [navigate]);

  return (
    <div className="auth-container">
      <div style={{ color: 'var(--text-secondary)' }}>認証中…</div>
    </div>
  );
};
