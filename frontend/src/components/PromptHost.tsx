import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { ChoiceItem, ChoiceOptions, PromptOptions } from './prompt';

/* App 直下に1つ置く。showPrompt() / showChoice() が発火するイベントを購読して
 * モーダルを出し、結果を返す。ConfirmHost と同じ作り。 */

type PromptState = PromptOptions & { id: number; message: string };
type ChoiceState = ChoiceOptions & { id: number; message: string; choices: ChoiceItem[] };

const PromptDialog: React.FC<{ state: PromptState; respond: (v: string | null) => void }> = ({
  state,
  respond,
}) => {
  const [value, setValue] = useState(state.defaultValue ?? '');

  // 別の prompt が開いたら初期値を入れ直す
  useEffect(() => {
    setValue(state.defaultValue ?? '');
  }, [state.id, state.defaultValue]);

  const isNumber = state.type === 'number';
  const num = Number(value);

  // 確定できない理由。ここで弾いておくとサーバーへ投げてから怒られずに済む。
  let blocked: string | null = null;
  if (value.trim() === '') {
    blocked = '';
  } else if (isNumber && !Number.isFinite(num)) {
    blocked = '数値を入力してください';
  } else if (isNumber && state.min !== undefined && num < state.min) {
    blocked = `${state.min.toLocaleString()} 以上を入力してください`;
  } else if (state.requireMatch !== undefined && value !== state.requireMatch) {
    blocked = `「${state.requireMatch}」と正確に入力してください`;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked === null) respond(value);
  };

  return (
    <Modal
      open
      onClose={() => respond(null)}
      title={state.title ?? '入力'}
      // 取り消せない操作は、オーバーレイクリックや ESC で閉じさせない
      dismissable={!state.danger}
      actions={
        <>
          <button type="button" className="text-btn" onClick={() => respond(null)}>
            {state.cancelLabel ?? 'キャンセル'}
          </button>
          <button
            type="button"
            className="submit-btn"
            onClick={() => blocked === null && respond(value)}
            disabled={blocked !== null}
            style={state.danger ? { background: 'var(--danger)' } : undefined}
          >
            {state.confirmLabel ?? 'OK'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div style={{ whiteSpace: 'pre-wrap', marginBottom: 'var(--space-4)' }}>{state.message}</div>
        <input
          className="input-field"
          type={isNumber ? 'number' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={state.placeholder}
          min={state.min}
          autoFocus
        />
        {/* 空欄のうちは何も言わない。打ち始めてから理由を出す */}
        {blocked ? (
          <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 'var(--space-2)' }}>{blocked}</div>
        ) : null}
        {/* Enter で確定できるようにするためのボタン。見た目には出さない */}
        <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
};

const ChoiceDialog: React.FC<{ state: ChoiceState; respond: (v: string | null) => void }> = ({
  state,
  respond,
}) => (
  <Modal
    open
    onClose={() => respond(null)}
    title={state.title ?? '選択'}
    actions={
      <button type="button" className="text-btn" onClick={() => respond(null)}>
        {state.cancelLabel ?? 'キャンセル'}
      </button>
    }
  >
    <div style={{ whiteSpace: 'pre-wrap', marginBottom: 'var(--space-4)' }}>{state.message}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {state.choices.map((c) => (
        <button
          key={c.value}
          type="button"
          className="choice-btn"
          onClick={() => respond(c.value)}
        >
          <b>{c.label}</b>
          {c.hint && <span>{c.hint}</span>}
        </button>
      ))}
    </div>
  </Modal>
);

export const PromptHost: React.FC = () => {
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [choice, setChoice] = useState<ChoiceState | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => setPrompt((e as CustomEvent).detail as PromptState);
    const onChoice = (e: Event) => setChoice((e as CustomEvent).detail as ChoiceState);
    window.addEventListener('app-prompt', onPrompt as EventListener);
    window.addEventListener('app-choice', onChoice as EventListener);
    return () => {
      window.removeEventListener('app-prompt', onPrompt as EventListener);
      window.removeEventListener('app-choice', onChoice as EventListener);
    };
  }, []);

  const respondPrompt = (value: string | null) => {
    if (prompt) window.dispatchEvent(new CustomEvent('app-prompt-result', { detail: { id: prompt.id, value } }));
    setPrompt(null);
  };

  const respondChoice = (value: string | null) => {
    if (choice) window.dispatchEvent(new CustomEvent('app-choice-result', { detail: { id: choice.id, value } }));
    setChoice(null);
  };

  return (
    <>
      {prompt && <PromptDialog key={prompt.id} state={prompt} respond={respondPrompt} />}
      {choice && <ChoiceDialog key={choice.id} state={choice} respond={respondChoice} />}
    </>
  );
};
