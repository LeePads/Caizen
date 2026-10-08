'use client';

import { useEffect } from 'react';
import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';

type EntrySnapshot = { value: string; start: number | null; end: number | null };

function snapshot(input: HTMLInputElement): EntrySnapshot {
  return { value: input.value, start: input.selectionStart, end: input.selectionEnd };
}

function eligible(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement) || target.disabled || target.readOnly) return false;
  if (target.dataset.caizenCharacterPop !== 'on' || target.type !== 'text') return false;
  if (target.inputMode && target.inputMode !== 'text') return false;
  if (target.autocomplete !== 'off' || target.value.length > 120) return false;
  if (target.matches('[role="combobox"], [list], [aria-autocomplete]')) return false;
  if (/password|passphrase|secret|token|otp/i.test(`${target.name}:${target.id}`)) return false;
  if (target.closest('.money-input-shell, [data-caizen-character-pop="off"]')) return false;
  return document.activeElement === target && document.visibilityState === 'visible';
}

function insertedRange(before: EntrySnapshot, value: string) {
  // Prefer the native selection: identical adjacent characters otherwise make a diff ambiguous.
  if (before.start !== null && before.end !== null) {
    const length = value.length - before.value.length + before.end - before.start;
    if (length > 0 && value.slice(0, before.start) === before.value.slice(0, before.start)
      && value.slice(before.start + length) === before.value.slice(before.end)) {
      return { start: before.start, end: before.start + length };
    }
  }
  let start = 0;
  while (start < before.value.length && start < value.length && before.value[start] === value[start]) start++;
  let suffix = 0;
  while (suffix < before.value.length - start && suffix < value.length - start
    && before.value[before.value.length - suffix - 1] === value[value.length - suffix - 1]) suffix++;
  return { start, end: value.length - suffix };
}

/** One short-lived glyph overlay. Existing text always keeps its native paint. */
export function useCaizenCharacterPop() {
  const mode = useCaizenMotionMode();

  useEffect(() => {
    if (mode !== 'full' && mode !== 'android') return;
    const entries = new WeakMap<HTMLInputElement, EntrySnapshot>();
    const composing = new WeakSet<HTMLInputElement>();
    const compositionPending = new WeakSet<HTMLInputElement>();
    const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    let disposed = false;
    let active: { input: HTMLInputElement; layer: HTMLDivElement; text: HTMLSpanElement;
      value: string; timer: ReturnType<typeof setTimeout>; caret: string; caretPriority: string } | null = null;

    const settle = () => {
      if (!active) return;
      clearTimeout(active.timer);
      active.input.removeAttribute('data-caizen-character-pop-active');
      if (active.caret) active.input.style.setProperty('--caizen-character-caret', active.caret, active.caretPriority);
      else active.input.style.removeProperty('--caizen-character-caret');
      active.layer.remove();
      active = null;
    };

    const position = () => {
      if (!active) return;
      const { input, layer, text } = active;
      if (!input.isConnected || input.value !== active.value || !eligible(input)) { settle(); return; }
      const bounds = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const left = parseFloat(style.paddingLeft) || 0;
      const right = parseFloat(style.paddingRight) || 0;
      const top = parseFloat(style.paddingTop) || 0;
      const bottom = parseFloat(style.paddingBottom) || 0;
      const width = Math.max(0, input.clientWidth - left - right);
      Object.assign(layer.style, {
        left: `${bounds.left + input.clientLeft + left}px`,
        top: `${bounds.top + input.clientTop + top}px`,
        width: `${width}px`, height: `${Math.max(0, input.clientHeight - top - bottom)}px`,
      });
      text.style.width = `${Math.max(width, input.scrollWidth - left - right)}px`;
      text.style.transform = `translateX(${-input.scrollLeft}px)`;
    };

    const pop = (input: HTMLInputElement, before: EntrySnapshot, composition = false) => {
      settle();
      if (disposed || !eligible(input) || input.value === before.value) return;
      if (input.selectionStart !== input.selectionEnd) return;
      const range = insertedRange(before, input.value);
      const inserted = input.value.slice(range.start, range.end);
      if (!inserted.trim() || inserted.length > 32) return;
      if (!composition && (segmenter ? Array.from(segmenter.segment(inserted)).length : Array.from(inserted).length) !== 1) return;
      const style = getComputedStyle(input);
      const security = style.getPropertyValue('-webkit-text-security').trim();
      const lineHeight = parseFloat(style.lineHeight);
      const contentHeight = input.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const background = style.backgroundColor;
      // Complex shaping, autofill paint and transformed fields retain their native rendering.
      // Never display a broken mirror just to force an animation.
      if (style.direction !== 'ltr' || /[\u0590-\u0dff]/.test(input.value) || /^\p{Mark}/u.test(inserted)
        || (security && security !== 'none')
        || (CSS.supports('selector(:autofill)') && input.matches(':autofill'))
        || Math.abs(input.getBoundingClientRect().width - input.offsetWidth) > 1
        || Math.abs(input.getBoundingClientRect().height - input.offsetHeight) > 1
        || !['left', 'start'].includes(style.textAlign) || parseFloat(style.textIndent) !== 0
        || !Number.isFinite(lineHeight) || contentHeight < lineHeight
        || !/^rgb\([\d\s,]+\)$/.test(background) || style.backgroundImage !== 'none'
        || style.textShadow !== 'none' || style.fontStyle !== 'normal'
        || parseFloat(style.letterSpacing) < 0) return;
      const layer = document.createElement('div');
      layer.className = 'caizen-character-pop-layer';
      layer.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'caizen-character-pop-text';
      for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variant',
        'font-kerning', 'font-feature-settings', 'font-variation-settings', 'font-optical-sizing',
        'letter-spacing', 'word-spacing', 'line-height', 'text-align', 'text-indent', 'text-transform', 'text-shadow']) {
        text.style.setProperty(property, style.getPropertyValue(property));
      }
      text.style.color = 'transparent';
      text.style.textShadow = 'none';
      text.append(document.createTextNode(input.value.slice(0, range.start)));
      const glyph = document.createElement('span');
      glyph.className = 'caizen-character-pop-glyph';
      glyph.textContent = inserted;
      glyph.style.color = style.color;
      const slot = document.createElement('span');
      slot.className = 'caizen-character-pop-slot';
      slot.style.backgroundColor = background;
      slot.append(glyph);
      text.append(slot, document.createTextNode(input.value.slice(range.end)));
      layer.append(text);
      document.body.append(layer);
      const token = style.getPropertyValue('--motion-micro').trim();
      const duration = parseFloat(token) * (token.endsWith('ms') ? 1 : 1000);
      active = { input, layer, text, value: input.value,
        caret: input.style.getPropertyValue('--caizen-character-caret'),
        caretPriority: input.style.getPropertyPriority('--caizen-character-caret'),
        timer: setTimeout(() => { if (active?.layer === layer) settle(); }, (Number.isFinite(duration) ? duration : 140) + 30) };
      position();
      if (!active) return;
      // Splitting a shaped run must not change its width or the glyph's position.
      // Compare against an unsplit copy before covering only the new character.
      const plain = text.cloneNode(false) as HTMLSpanElement;
      plain.textContent = input.value;
      plain.style.position = 'absolute';
      plain.style.left = '0';
      layer.append(plain);
      const fullRange = document.createRange();
      fullRange.selectNodeContents(plain);
      const splitRange = document.createRange();
      splitRange.selectNodeContents(text);
      const glyphRange = document.createRange();
      glyphRange.setStart(plain.firstChild!, range.start);
      glyphRange.setEnd(plain.firstChild!, range.end);
      const nativeGlyph = glyphRange.getBoundingClientRect();
      const overlayGlyph = slot.getBoundingClientRect();
      const paintedRange = document.createRange();
      paintedRange.selectNodeContents(glyph);
      const aligned = Math.abs(fullRange.getBoundingClientRect().width - splitRange.getBoundingClientRect().width) < 0.1
        && Math.abs(nativeGlyph.left - overlayGlyph.left) < 0.1
        && Math.abs(nativeGlyph.width - overlayGlyph.width) < 0.1
        && Math.abs(nativeGlyph.top - paintedRange.getBoundingClientRect().top) < 0.1;
      plain.remove();
      if (!aligned) { settle(); return; }
      input.style.setProperty('--caizen-character-caret', style.caretColor === 'auto' ? style.color : style.caretColor);
      input.dataset.caizenCharacterPopActive = 'true';
      glyph.addEventListener('animationend', () => { if (active?.layer === layer) settle(); }, { once: true });
      // Controlled owners may normalize or reject the edit; their real value always wins.
      queueMicrotask(() => {
        if (active?.input !== input) return;
        if (input.value !== active.value) settle();
        else position();
      });
    };

    const onFocus = (event: FocusEvent) => {
      settle();
      if (eligible(event.target)) entries.set(event.target, snapshot(event.target));
    };
    const onBeforeInput = (event: Event) => {
      settle();
      if (eligible(event.target) && !composing.has(event.target) && !compositionPending.has(event.target)) {
        entries.set(event.target, snapshot(event.target));
      }
    };
    const onInput = (event: Event) => {
      if (!eligible(event.target)) { settle(); return; }
      const input = event.target;
      const native = event as InputEvent;
      if (native.isComposing || composing.has(input) || compositionPending.has(input)) return;
      const before = entries.get(input);
      if (native.inputType === 'insertText' && before) pop(input, before);
      else settle(); // Paste, deletion, undo and autocorrect stay native.
      entries.set(input, snapshot(input));
    };
    const onCompositionStart = (event: CompositionEvent) => {
      settle();
      if (!eligible(event.target)) return;
      entries.set(event.target, snapshot(event.target));
      composing.add(event.target);
    };
    const onCompositionEnd = (event: CompositionEvent) => {
      if (!eligible(event.target)) return;
      const input = event.target;
      composing.delete(input);
      compositionPending.add(input);
      // Some keyboards emit their final input after compositionend in the same dispatch turn.
      queueMicrotask(() => {
        compositionPending.delete(input);
        if (disposed || !eligible(input)) return;
        const before = entries.get(input);
        if (event.data && before) pop(input, before, true);
        entries.set(input, snapshot(input));
      });
    };
    const onSelection = () => {
      if (active && active.input.selectionStart !== active.input.selectionEnd) settle();
    };
    const onScroll = (event: Event) => {
      if (active && event.target === active.input) position();
      else settle();
    };
    const onVisibility = () => { if (document.visibilityState !== 'visible') settle(); };

    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', settle);
    document.addEventListener('beforeinput', onBeforeInput, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('compositionstart', onCompositionStart, true);
    document.addEventListener('compositionend', onCompositionEnd, true);
    document.addEventListener('selectionchange', onSelection);
    document.addEventListener('select', onSelection, true);
    document.addEventListener('pointerdown', settle, true);
    document.addEventListener('keydown', settle, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', settle);
    window.visualViewport?.addEventListener('resize', settle);
    window.visualViewport?.addEventListener('scroll', settle);
    return () => {
      disposed = true;
      settle();
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', settle);
      document.removeEventListener('beforeinput', onBeforeInput, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('compositionstart', onCompositionStart, true);
      document.removeEventListener('compositionend', onCompositionEnd, true);
      document.removeEventListener('selectionchange', onSelection);
      document.removeEventListener('select', onSelection, true);
      document.removeEventListener('pointerdown', settle, true);
      document.removeEventListener('keydown', settle, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', settle);
      window.visualViewport?.removeEventListener('resize', settle);
      window.visualViewport?.removeEventListener('scroll', settle);
    };
  }, [mode]);
}
