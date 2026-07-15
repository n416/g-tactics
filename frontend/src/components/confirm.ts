// window.confirm のドロップイン置換（モーダル版）。await showConfirm('…') で true/false が返る。
// 画面に1つ置いた <ConfirmHost/> が 'app-confirm' を購読してモーダルを出し、結果を返す。
export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

let seq = 0;

export function showConfirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const id = ++seq;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.id !== id) return;
      window.removeEventListener('app-confirm-result', handler as EventListener);
      resolve(!!detail.result);
    };
    window.addEventListener('app-confirm-result', handler as EventListener);
    window.dispatchEvent(new CustomEvent('app-confirm', { detail: { id, message, ...opts } }));
  });
}
