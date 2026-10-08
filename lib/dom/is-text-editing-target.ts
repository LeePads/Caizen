export function isTextEditingTarget(
  target: EventTarget | null,
): boolean {
  if (
    typeof HTMLElement === 'undefined' ||
    !(target instanceof HTMLElement)
  ) {
    return false;
  }

  const element = target as HTMLElement;

  // Keyboard events from custom comboboxes and rich text controls can land on
  // an editable descendant or on a role-based textbox rather than a native
  // input element. Treat the whole editing surface as user text so global
  // shortcuts never steal a typed space, S, Q, or arrow key.
  if (
    element.isContentEditable ||
    (typeof element.closest === 'function' &&
      element.closest('[contenteditable="true"], [role="textbox"], [role="combobox"]'))
  ) {
    return true;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
