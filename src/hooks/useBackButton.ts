import { useEffect, useRef } from 'react';
import { getTelegramWebApp } from '@/lib/telegram';

/**
 * Telegram's native back button (header arrow, and the Android hardware back
 * key). Without it, Android's back key closes the whole Mini App.
 *
 * Several parts of the UI can want "back" at once (a screen, then a modal on
 * top of it). Handlers form a stack: the most recently registered one runs,
 * and the button is visible only while at least one is registered.
 */
interface Entry {
  run: () => void;
}

const stack: Entry[] = [];
let listening = false;

function onTelegramBack() {
  stack[stack.length - 1]?.run();
}

function sync() {
  const button = nativeBackButton();
  if (!button) return;
  if (!listening) {
    button.onClick(onTelegramBack);
    listening = true;
  }
  if (stack.length > 0) button.show();
  else button.hide();
}

function nativeBackButton() {
  const tg = getTelegramWebApp();
  if (!tg?.BackButton || !(tg.isVersionAtLeast?.('6.1') ?? false)) return null;
  return tg.BackButton;
}

/** True when Telegram shows its own back button, so in-app arrows are redundant. */
export function hasNativeBackButton(): boolean {
  return nativeBackButton() !== null;
}

/** Registers `handler` for Telegram's back button while it is non-null. */
export function useBackButton(handler: (() => void) | null): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  const enabled = handler !== null;
  useEffect(() => {
    if (!enabled) return;
    const entry: Entry = { run: () => latest.current?.() };
    stack.push(entry);
    sync();
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      sync();
    };
  }, [enabled]);
}
