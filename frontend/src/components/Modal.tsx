import React from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;   // フッターのボタン群（省略可）
}

// 汎用モーダル。オーバーレイクリックで閉じる。window.alert/confirm の置換や入力フォームに使う。
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, actions }) => {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '1.5rem', width: 'min(92vw, 460px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      >
        {title && <h3 style={{ margin: '0 0 1rem', color: '#4facfe' }}>{title}</h3>}
        <div>{children}</div>
        {actions && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.25rem' }}>{actions}</div>}
      </div>
    </div>
  );
};
