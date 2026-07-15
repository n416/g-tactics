import React, { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NAV_GROUPS, NAV_HOME, NAV_PRIMARY, type NavItem } from './nav';
import './AppLayout.css';

/* ============================================================
 * ログイン後の全ページを包む外枠。
 *
 * ここが引き受ける責務:
 *   - 認証ガード（旧: 各ページが個別に token を見て navigate('/') していた）
 *   - ヘッダーの HUD（HP/EN/資金/未読伝言）
 *   - ナビゲーション（旧: マイページ下部の13分割ボタングリッドが実質のナビだった）
 *
 * 各ページはこの中に <Outlet /> として描画されるので、ページ側は
 * 「中身」だけを持てばよい。
 * ============================================================ */

type Me = {
  id: string;
  handle_name: string;
  chara_name: string;
  money: number;
  current_hp: number;
  max_hp: number;
  current_en: number;
  max_en: number;
  rank?: string;
  is_admin: number;
};

const pct = (cur: number, max: number) =>
  max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [unread, setUnread] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem('gtactics_token');
    navigate('/');
  }, [navigate]);

  // HUD 用の自分の状態。各ページも個別に /api/me を叩いているが、
  // ページ側の refetch まで巻き取るのは次フェーズとし、ここでは表示に必要な分だけ持つ。
  useEffect(() => {
    const token = localStorage.getItem('gtactics_token');
    if (!token) {
      navigate('/');
      return;
    }
    const auth = { Authorization: `Bearer ${token}` };

    fetch('/api/me', { headers: auth })
      .then((r) => r.json())
      .then((d: any) => {
        if (d.success) setMe(d.user);
        else {
          localStorage.removeItem('gtactics_token');
          navigate('/');
        }
      })
      .catch(() => {});

    fetch('/api/messages/private/unread-count', { headers: auth })
      .then((r) => r.json())
      .then((d: any) => {
        if (d.success) setUnread(d.count);
      })
      .catch(() => {});
  }, [navigate, location.pathname]);

  // ページ遷移したらドロワーとユーザーメニューは閉じる
  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // ESC でユーザーメニューを閉じる（開けたら必ず閉じられること）
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // ドロワーを開いている間は背後をスクロールさせない
  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [navOpen]);

  const renderLink = (item: NavItem, extra = '') => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) => `nav-link ${extra} ${isActive ? 'active' : ''}`}
    >
      <span className="nav-ico" aria-hidden="true">{item.icon}</span>
      {item.label}
    </NavLink>
  );

  return (
    <div className="layout">
      <header className="layout-header">
        <button
          className="nav-toggle"
          onClick={() => setNavOpen((v) => !v)}
          aria-label={navOpen ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={navOpen}
        >
          {navOpen ? '✕' : '☰'}
        </button>

        <Link to="/mypage" className="layout-brand">
          G<span>-</span>Tactics
        </Link>

        <div className="hud">
          {me && (
            <>
              <div className="hud-item">
                <div className="hud-label">
                  <span>耐久</span>
                  <span className="hud-value">
                    {Math.floor(me.current_hp)}/{Math.floor(me.max_hp)}
                  </span>
                </div>
                <div className="hud-bar">
                  <i style={{ width: `${pct(me.current_hp, me.max_hp)}%`, background: 'var(--success)' }} />
                </div>
              </div>

              <div className="hud-item">
                <div className="hud-label">
                  <span>EN</span>
                  <span className="hud-value">
                    {Math.floor(me.current_en)}/{Math.floor(me.max_en)}
                  </span>
                </div>
                <div className="hud-bar">
                  <i style={{ width: `${pct(me.current_en, me.max_en)}%`, background: 'var(--accent-color)' }} />
                </div>
              </div>

              <div className="hud-money">{me.money.toLocaleString()} pt</div>
            </>
          )}

          {unread > 0 && me && (
            <button
              className="hud-badge"
              onClick={() => navigate(`/profile/${me.id}`)}
              title="伝言を確認する"
            >
              伝言 {unread}
            </button>
          )}

          {/* ユーザーメニュー。アカウント系の導線は右上に集める（一般的な置き場所）。
            * 以前はログアウトだけが裸で置かれ、アカウント設定への入り口が無かった。 */}
          {me && (
            <div className="user-menu">
              <button
                className="user-menu-trigger"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="user-menu-name">{me.handle_name}</span>
                <span aria-hidden="true">▾</span>
              </button>

              {menuOpen && (
                <>
                  <div className="user-menu-scrim" onClick={() => setMenuOpen(false)} />
                  <div className="user-menu-pop" role="menu">
                    <div className="user-menu-head">
                      <b>{me.handle_name}</b>
                      <span>{me.chara_name}</span>
                    </div>
                    <Link to="/account" className="user-menu-item" role="menuitem">アカウント設定</Link>
                    <Link to="/profile-edit" className="user-menu-item" role="menuitem">プロフィール変更</Link>
                    <Link to={`/profile/${me.id}`} className="user-menu-item" role="menuitem">ステータス詳細</Link>
                    <button className="user-menu-item danger" role="menuitem" onClick={logout}>ログアウト</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {navOpen && <div className="layout-scrim" onClick={() => setNavOpen(false)} />}

      <nav className={`layout-nav ${navOpen ? 'open' : ''}`} aria-label="メインナビゲーション">
        {renderLink(NAV_PRIMARY, 'primary')}
        {renderLink(NAV_HOME)}

        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.title}>
            <div className="nav-group-title">{group.title}</div>
            {group.items.map((item) => renderLink(item))}
          </div>
        ))}

        {me?.is_admin === 1 && (
          <div className="nav-group">
            <div className="nav-group-title">管理</div>
            {renderLink({ to: '/admin', label: '管理画面', icon: '⚑' })}
          </div>
        )}
      </nav>

      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
};
