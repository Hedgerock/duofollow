import { type CDPSession, expect, type Locator, test } from 'playwright/test';

import { connectorCommands, openComparison } from '@duofollow/e2e/connector-fixture';

const profileCount = 10_000;
const warmupCycles = 6;
const batches = 4;
const cyclesPerBatch = 10;
const maxMountedRows = 24;
const mebibyte = 1024 ** 2;

async function scrollTo(list: Locator, position: number) {
  const metrics = await list.evaluate((element, fraction) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction;
    const row = element.querySelector('li[data-following-id]');
    const height = row?.getBoundingClientRect().height ?? 0;
    return { index: Math.floor(element.scrollTop / height) + 1, position: fraction };
  }, position);
  await expect(list.locator(`[aria-posinset="${metrics.index}"]`)).toHaveCount(1);
  if (metrics.position === 1) {
    await expect(list.locator(`[aria-posinset="${profileCount}"]`)).toHaveCount(1);
  }
  const rows = await list.locator('[data-following-id]').count();
  expect(rows).toBeLessThanOrEqual(maxMountedRows);
  return rows;
}

async function snapshot(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const { documents, nodes, jsEventListeners } = await cdp.send('Memory.getDOMCounters');
  return { usedSize, documents, nodes, jsEventListeners };
}

test('10,000 follows keep the virtual DOM and retained heap bounded', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const panel = await openComparison(page, { profileCount });
  const list = panel.locator('.virtual-following');
  const tabs = panel.getByRole('group', { name: 'Show follows' });
  const search = panel.getByRole('searchbox');
  const sort = panel.getByRole('combobox', { name: 'Sort follows' });
  let peakMountedRows = 0;
  await expect(list.locator('[aria-setsize="10000"]').first()).toBeAttached();

  async function runCycle(cycle: number) {
    // Move the intermediate stops so that later cycles mount new profiles.
    const offset = (cycle % 10) / 100;
    for (const position of [0.1 + offset, 0.35 + offset, 0.7 + offset, 1, 0.5 - offset, 0]) {
      peakMountedRows = Math.max(peakMountedRows, await scrollTo(list, position));
    }

    await tabs.getByRole('button', { name: 'Mutual', exact: true }).click();
    await expect(list.locator('[data-following-id="2"]')).toHaveCount(1);
    await tabs.getByRole('button', { name: 'All received', exact: true }).click();
    await search.fill('profile_00042');
    await expect(list.locator('[data-following-id]')).toHaveCount(1);
    await expect(list.locator('[data-following-id="42"]')).toBeVisible();
    await search.clear();
    await sort.selectOption('name-asc');
    await sort.selectOption('received');
    await expect(list.locator('[data-following-id="2"]')).toHaveCount(1);
  }

  async function visitSettings() {
    await list.locator('[data-following-id="2"] .relationship-marker').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Mutual');
    await page.getByRole('link', { name: 'Settings' }).click();
    // The new header can show its own Settings tooltip under the pointer.
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to comparison' }).click();
    await expect(list.locator('[data-following-id="2"]')).toHaveCount(1);
    // Sample only after the comparison is back in the same visible state.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }

  const cdp = await page.context().newCDPSession(page);
  for (let cycle = 0; cycle < warmupCycles; cycle += 1) await runCycle(cycle);
  // Warm the portal event delegation and route before measuring retained resources.
  await visitSettings();
  const baseline = await snapshot(cdp);
  const samples = [baseline];
  for (let batch = 0; batch < batches; batch += 1) {
    for (let cycle = 0; cycle < cyclesPerBatch; cycle += 1) {
      await runCycle(warmupCycles + batch * cyclesPerBatch + cycle);
    }
    await visitSettings();
    samples.push(await snapshot(cdp));
  }

  const report = { profileCount, warmupCycles, cyclesPerBatch, peakMountedRows, samples };
  await testInfo.attach('virtual-list-memory', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  console.log('Virtual list memory', JSON.stringify(report));
  await cdp.detach();

  for (const sample of samples.slice(1)) {
    expect(sample.usedSize - baseline.usedSize).toBeLessThanOrEqual(1.5 * mebibyte);
    expect(sample.nodes - baseline.nodes).toBeLessThanOrEqual(160);
    expect(sample.jsEventListeners - baseline.jsEventListeners).toBeLessThanOrEqual(24);
    expect(sample.documents).toBe(baseline.documents);
  }
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('combobox', { name: 'Text size' }).selectOption('extra-large');
  await page.getByRole('link', { name: 'Back to comparison' }).click();
  await expect(list.locator('[data-following-id="2"]')).toHaveCSS('height', '85px');
  await scrollTo(list, 1);

  expect(
    (await connectorCommands(page)).filter((type) => type === 'GET_FOLLOWING_SUMMARY'),
  ).toHaveLength(1);
});
