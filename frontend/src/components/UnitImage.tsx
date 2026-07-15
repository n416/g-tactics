import React from 'react';

// ============================================================
// 機体画像の参照を一箇所に集約する。
//
// - 配信元は VITE_UNIT_IMAGE_BASE で切り替える（未設定なら同一オリジンの /images/units）。
//   本番で R2 等の外部ストレージに置く場合はビルド時にこの環境変数を設定する。
// - 画像が未収集/読み込み失敗のユニットはプレースホルダにフォールバックする
//   （units の 1/3 強は元サーバーにも画像が無く、取得不能なため）。
// ============================================================

const BASE = (import.meta.env.VITE_UNIT_IMAGE_BASE ?? '/images/units').replace(/\/$/, '');

export const NO_UNIT_IMAGE = '/images/no-unit.svg';

/** 機体画像のURLを返す。file が無ければプレースホルダ。 */
export function unitImageUrl(file?: string | null): string {
  if (!file) return NO_UNIT_IMAGE;
  return `${BASE}/${file}`;
}

type Props = {
  /** units.image のファイル名（例 "RX-78-2.gif"）。未設定ならプレースホルダ */
  file?: string | null;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
};

/** 機体画像。読み込み失敗時はプレースホルダに差し替える。 */
export const UnitImage: React.FC<Props> = ({ file, alt, style, className }) => (
  <img
    src={unitImageUrl(file)}
    alt={alt ?? ''}
    className={className}
    style={style}
    onError={(e) => {
      const el = e.currentTarget;
      if (el.src.endsWith(NO_UNIT_IMAGE)) return; // プレースホルダ自体の失敗で無限ループしない
      el.src = NO_UNIT_IMAGE;
    }}
  />
);
