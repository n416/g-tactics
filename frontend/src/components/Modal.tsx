import React, { useCallback, useEffect, useRef } from 'react';
import './Modal.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** フッターのボタン群（省略可） */
  actions?: React.ReactNode;
  /** 中身に合わせて選ぶ。sm=確認/入力, md=一覧, lg=表を含むもの */
  size?: 'sm' | 'md' | 'lg';
  /** オーバーレイクリックと ESC で閉じられるか。
   * 取り消せない操作の確認では false にして、明示的な選択を強制する。 */
  dismissable?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 汎用モーダル。アプリ内のダイアログはすべてこれを通す。
 *
 * 各ページが position:fixed のオーバーレイを手書きしていたのをここへ集約したもの。
 * 手書き版に無かった以下をここで一括して面倒みる:
 *   - ESC で閉じる
 *   - 背面のスクロール固定
 *   - 開いたらフォーカスを中へ移し、閉じたら元の要素へ戻す
 *   - Tab を内側で循環させる（背後のページへ抜けさせない）
 *   - role="dialog" / aria-modal
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  actions,
  size = 'sm',
  dismissable = true,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  // 背面のスクロールを止める
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 開いた時のフォーカス移動と、閉じた時の復帰
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const first = boxRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? boxRef.current)?.focus();

    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // ESC で閉じる / Tab を内側で循環させる
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = Array.from(boxRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === boxRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div
        ref={boxRef}
        className={`modal-box ${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {title && (
          <div className="modal-head">
            <h3 className="modal-title">{title}</h3>
            {dismissable && (
              <button type="button" className="modal-close" onClick={onClose} aria-label="閉じる">
                ✕
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-foot">{actions}</div>}
      </div>
    </div>
  );
};
