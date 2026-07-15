/* ============================================================
 * ナビゲーションの単一の正。
 *
 * 以前はマイページ下部の repeat(13, 1fr) グリッドが実質のグローバルナビだった。
 * そのため (a) 13等分でラベルが潰れ、(b) マイページ以外に行くと戻る導線が無く、
 * (c) 現在地が分からなかった。ここに集約してサイドバー/ドロワーの両方から描画する。
 *
 * 項目を足すときはここだけ触ればよい。
 * ============================================================ */

export type NavItem = {
  to: string;
  label: string;
  /** サイドバーの視線の足がかり。装飾なので読み上げからは隠す */
  icon: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

/** 最上段に単独で置く主導線 */
export const NAV_PRIMARY: NavItem = { to: '/battle', label: '出撃', icon: '⚔' };

export const NAV_HOME: NavItem = { to: '/mypage', label: 'ステータス', icon: '◈' };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: '拠点',
    items: [
      { to: '/hangar', label: '格納庫', icon: '⬢' },
      { to: '/training', label: 'フラナガン機関', icon: '⌘' },
      { to: '/anaheim', label: 'アナハイム', icon: '⚙' },
      { to: '/trade', label: '中古MS売り場', icon: '⇄' },
      { to: '/team', label: 'チーム編成', icon: '⧉' },
    ],
  },
  {
    title: '戦闘',
    items: [
      { to: '/tournament', label: 'トーナメント', icon: '♛' },
      { to: '/simulator', label: 'シミュレーター', icon: '◐' },
      { to: '/tactics', label: '戦術設定', icon: '⊹' },
      { to: '/log', label: '防衛履歴', icon: '☰' },
    ],
  },
  {
    title: '情報',
    items: [
      { to: '/ranking', label: 'ランキング', icon: '▲' },
      { to: '/database', label: '機体データベース', icon: '▦' },
      { to: '/faction', label: '勢力一覧', icon: '⬟' },
    ],
  },
  {
    title: '交流',
    items: [
      { to: '/chat', label: 'チャット', icon: '💬' },
      { to: '/bbs', label: '掲示板', icon: '✎' },
    ],
  },
];
