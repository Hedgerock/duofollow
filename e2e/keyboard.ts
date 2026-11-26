import { expect } from 'playwright/test';

import type { Locator, Page } from 'playwright/test';

/** Position the tab sequence, then let a real Tab acquire focus and select keyboard modality. */
export async function focusWithKeyboard(page: Page, target: Locator) {
  const first = await target.evaluate((element) => {
    const candidates = document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    );
    return (
      Array.from(candidates).find(
        (candidate) =>
          candidate.tabIndex >= 0 &&
          !candidate.matches(':disabled') &&
          !candidate.closest('[inert]') &&
          candidate.getClientRects().length > 0 &&
          getComputedStyle(candidate).visibility !== 'hidden',
      ) === element
    );
  });
  await target.focus();
  // Let focus-induced scrolling finish before the key which should open the tooltip.
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  await page.keyboard.press(first ? 'Tab' : 'Shift+Tab');
  // The first page link must not move backwards into browser chrome. Other controls
  // start backwards so a select does not scroll the following list into view.
  for (let step = 0; step < 64; step++) {
    await page.keyboard.press(first ? 'Shift+Tab' : 'Tab');
    if (await target.evaluate((element) => document.activeElement === element)) break;
  }
  await expect(target).toBeFocused();
}

/** Open the actual native picker; opening does not imply Playwright can send keys to its native UI. */
export async function openNativeSelect(target: Locator, method: 'pointer' | 'keyboard') {
  await target.evaluate((element, method) => {
    const select = element as HTMLSelectElement;
    const history: { phase: string; open: boolean; focused: boolean; documentFocused: boolean }[] =
      [];
    Reflect.set(select, '__duofollowNativePickerLog', history);
    const record = (phase: string) => {
      history.push({
        phase,
        open: select.matches(':open'),
        focused: document.activeElement === select,
        documentFocused: document.hasFocus(),
      });
      if (history.length > 24) history.shift();
    };
    // Prevent the default mouse opening, then open once at click. Firefox can toggle a
    // picker again on mouseup/click when showPicker was called during pointerdown.
    if (method === 'pointer') {
      select.addEventListener('mousedown', (event) => event.preventDefault(), {
        capture: true,
        once: true,
      });
    }
    const type = method === 'pointer' ? 'click' : 'keydown';
    const open = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== ' ') return;
      select.removeEventListener(type, open, true);
      event.preventDefault();
      select.focus();
      record('before showPicker');
      select.showPicker();
      record('after showPicker');
      requestAnimationFrame(() => record('next frame'));
    };
    select.addEventListener(type, open, true);
  }, method);
  if (method === 'pointer') await target.click();
  else await target.press('Space');
  await expect.poll(() => target.evaluate((element) => element.matches(':open'))).toBe(true);
}

/** Close the real native picker through blur, optionally returning focus before it finishes closing. */
export async function dismissNativeSelectByBlur(
  target: Locator,
  { restoreFocus = false }: { restoreFocus?: boolean } = {},
) {
  await target.evaluate((element, restoreFocus) => {
    const select = element as HTMLSelectElement;
    select.blur();
    if (restoreFocus) select.focus({ preventScroll: true });
  }, restoreFocus);
  await expect.poll(() => target.evaluate((element) => element.matches(':open'))).toBe(false);
}

/** Browser-side state for failed native-picker tests; no input values or profile data are captured. */
export async function nativeSelectState(target: Locator) {
  return target.evaluate((element) => ({
    open: element.matches(':open'),
    focused: document.activeElement === element,
    focusVisible: element.matches(':focus-visible'),
    documentFocused: document.hasFocus(),
    visibility: document.visibilityState,
    history: Reflect.get(element, '__duofollowNativePickerLog') ?? [],
  }));
}
