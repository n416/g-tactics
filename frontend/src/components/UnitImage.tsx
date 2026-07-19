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

/** 機体画像。まずはPNGを優先し、失敗時は元の拡張子にフォールバック、最後にプレースホルダに差し替える。 */
export const UnitImage: React.FC<Props> = ({ file, alt, style, className }) => {
  // DBのファイル名が .gif 等でも、まずは .png としてリクエストする
  const preferredFile = file ? file.replace(/\.[^.]+$/, '.png') : null;
  const originalUrl = unitImageUrl(file);
  const [src, setSrc] = React.useState(unitImageUrl(preferredFile));

  // file prop が変わったら、再度 preferredFile のURLにリセットする
  React.useEffect(() => {
    setSrc(unitImageUrl(preferredFile));
  }, [preferredFile]);

  return (
    <img
      src={src}
      alt={alt ?? ''}
      className={className}
      style={style}
      onError={(e) => {
        const el = e.currentTarget;
        if (el.src.endsWith(NO_UNIT_IMAGE)) return; // プレースホルダ自体の失敗で無限ループしない

        // PNG (preferred) の読み込みに失敗した場合、本来の拡張子(元のURL)にフォールバック
        if (src !== originalUrl) {
          setSrc(originalUrl);
          return;
        }

        // 本来のURLでも失敗した場合はプレースホルダ
        setSrc(NO_UNIT_IMAGE);
      }}
    />
  );
};
