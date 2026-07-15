/* ============================================================
 * window.prompt のドロップイン置換。
 *
 * showToast() = alert の置換、showConfirm() = confirm の置換 と同じ作りに揃えてある。
 * 画面に1つ置いた <PromptHost/> がイベントを購読してモーダルを出し、結果を返す。
 *
 * window.prompt を潰す理由:
 *   - 見た目がブラウザ任せでアプリのトンマナから浮く
 *   - 入力の検証が「送ってみるまで分からない」（例: 入札額、削除確認のキャラ名）
 *   - 選択肢を文字入力させることになる（例: 陣営を「1」か「2」で打たせていた）
 *   - モバイルでの扱いが悪く、Safari では出ないことすらある
 * ============================================================ */

export interface PromptOptions {
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  /** 'number' なら数値入力にする */
  type?: 'text' | 'number';
  /** type='number' のときの下限。これ未満は確定できない */
  min?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 指定すると、この文字列と完全一致するまで確定ボタンを押せない。
   * 取り消せない操作の確認に使う（サーバーへ投げてから弾かれるのを防ぐ）。 */
  requireMatch?: string;
  /** 確定ボタンを危険色にし、オーバーレイクリックでの誤操作を防ぐ */
  danger?: boolean;
}

export interface ChoiceItem {
  value: string;
  label: string;
  /** 選択肢の補足説明 */
  hint?: string;
}

export interface ChoiceOptions {
  title?: string;
  cancelLabel?: string;
}

let seq = 0;

function ask<T>(openEvent: string, resultEvent: string, detail: Record<string, unknown>): Promise<T | null> {
  return new Promise((resolve) => {
    const id = ++seq;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.id !== id) return;
      window.removeEventListener(resultEvent, handler as EventListener);
      resolve(d.value);
    };
    window.addEventListener(resultEvent, handler as EventListener);
    window.dispatchEvent(new CustomEvent(openEvent, { detail: { id, ...detail } }));
  });
}

/** 文字列/数値を1つ入力させる。キャンセルなら null。 */
export function showPrompt(message: string, opts: PromptOptions = {}): Promise<string | null> {
  return ask<string>('app-prompt', 'app-prompt-result', { message, ...opts });
}

/** 選択肢から1つ選ばせる。キャンセルなら null。 */
export function showChoice(
  message: string,
  choices: ChoiceItem[],
  opts: ChoiceOptions = {}
): Promise<string | null> {
  return ask<string>('app-choice', 'app-choice-result', { message, choices, ...opts });
}
