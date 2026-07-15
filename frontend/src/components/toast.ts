// 軽量トースト: どこからでも showToast() で通知を出す（alert() の置換）。
// 画面に1つ置いた <ToastHost/> が 'app-toast' イベントを購読して描画する。
export type ToastType = 'success' | 'error' | 'info';

export function showToast(message: string, type: ToastType = 'info') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }));
}
