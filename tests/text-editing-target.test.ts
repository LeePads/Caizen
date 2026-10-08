import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isTextEditingTarget } from '@/lib/dom/is-text-editing-target';

class TestHTMLElement extends EventTarget {
  isContentEditable = false;
}
class TestInput extends TestHTMLElement {}
class TestTextarea extends TestHTMLElement {}
class TestSelect extends TestHTMLElement {}

describe('isTextEditingTarget', () => {
  const previous = {
    HTMLElement: globalThis.HTMLElement,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    HTMLSelectElement: globalThis.HTMLSelectElement,
  };

  beforeEach(() => {
    Object.assign(globalThis, {
      HTMLElement: TestHTMLElement,
      HTMLInputElement: TestInput,
      HTMLTextAreaElement: TestTextarea,
      HTMLSelectElement: TestSelect,
    });
  });

  afterEach(() => Object.assign(globalThis, previous));

  it('recognizes inputs, textareas, selects, and editable elements', () => {
    expect(isTextEditingTarget(new TestInput())).toBe(true);
    expect(isTextEditingTarget(new TestTextarea())).toBe(true);
    expect(isTextEditingTarget(new TestSelect())).toBe(true);
    const editable = new TestHTMLElement();
    editable.isContentEditable = true;
    expect(isTextEditingTarget(editable)).toBe(true);
  });

  it('does not treat ordinary elements as editors', () => {
    expect(isTextEditingTarget(new TestHTMLElement())).toBe(false);
    expect(isTextEditingTarget(null)).toBe(false);
  });
});
