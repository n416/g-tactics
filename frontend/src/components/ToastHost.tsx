import React, { useEffect, useState } from 'react';
import type { ToastType } from './toast';

interface ToastItem { id: number; message: string; type: ToastType; }

// App 直下に1つ置く。showToast() が発火する 'app-toast' を購読して画面右上に一定時間表示する。
export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail as { message: string; type: ToastType };
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
    };
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, []);

  const barColor = (t: ToastType) => (t === 'success' ? '#48bb78' : t === 'error' ? '#e53e3e' : '#4facfe');

  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: 'rgba(20,20,30,0.96)', color: '#fff', borderLeft: `4px solid ${barColor(t.type)}`,
            padding: '12px 18px', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            minWidth: 220, maxWidth: 360, fontSize: '0.9rem',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
};
