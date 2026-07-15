import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';

interface ConfirmState {
  id: number;
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

// App 直下に1つ置く。showConfirm() が発火する 'app-confirm' を購読してモーダルを出し、結果を返す。
export const ConfirmHost: React.FC = () => {
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    const handler = (e: Event) => setState((e as CustomEvent).detail as ConfirmState);
    window.addEventListener('app-confirm', handler as EventListener);
    return () => window.removeEventListener('app-confirm', handler as EventListener);
  }, []);

  const respond = (result: boolean) => {
    if (state) window.dispatchEvent(new CustomEvent('app-confirm-result', { detail: { id: state.id, result } }));
    setState(null);
  };

  return (
    <Modal
      open={!!state}
      onClose={() => respond(false)}
      title={state?.title || '確認'}
      actions={
        <>
          <button className="text-btn" onClick={() => respond(false)}>{state?.cancelLabel || 'キャンセル'}</button>
          <button className="submit-btn" style={{ margin: 0 }} onClick={() => respond(true)}>{state?.confirmLabel || 'OK'}</button>
        </>
      }
    >
      <div style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>{state?.message}</div>
    </Modal>
  );
};
