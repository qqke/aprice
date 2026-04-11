export async function waitForText(page, selector, expectedText) {
  await page.waitForFunction(
    ([targetSelector, text]) => String(document.querySelector(targetSelector)?.textContent || '').includes(text),
    [selector, expectedText],
  );
}

export async function waitForHidden(page, selector) {
  await page.waitForFunction(
    ([targetSelector]) => document.querySelector(targetSelector)?.hidden === true,
    [selector],
  );
}

export async function waitForVisible(page, selector) {
  await page.waitForFunction(
    ([targetSelector]) => document.querySelector(targetSelector)?.hidden === false,
    [selector],
  );
}

export async function waitForRequestMatch(requests, matcher, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (requests.some(matcher)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for request match');
}
