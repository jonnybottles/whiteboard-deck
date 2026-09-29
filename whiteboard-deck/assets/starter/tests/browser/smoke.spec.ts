import { test, expect } from '@playwright/test';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'));

test('the topic deck works as one isolated offline file', async ({ page, context }, testInfo) => {
  await context.setOffline(true);
  const target = testInfo.outputPath('isolated presentation', 'whiteboard.html');
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve('presentations', `${pkg.name}.html`), target);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(target).href);
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#start')).toBeEnabled();
  const count = await page.locator('#board-select option').count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    await page.locator('#board-select').selectOption(String(index));
    await page.locator('#show-all').click();
    await expect(page.locator('#error')).toBeHidden();
    await expect(page.locator('#board')).toHaveAttribute('data-active', '');
    await page.screenshot({ path: testInfo.outputPath(`board-${index + 1}.png`), fullPage: true });
  }
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await page.locator('#board-select').selectOption('0');
  await page.locator('#instant').check();
  await page.locator('#start').click();
  await expect(page.locator('#board')).toHaveAttribute('data-completed', '1');
  await page.locator('#notes').click();
  await page.locator('#panel-mode').selectOption('transcript');
  await expect(page.locator('#panel-content')).not.toBeEmpty();
});

test('writing contains actual partial strokes', async ({ page, context }, testInfo) => {
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve('presentations', `${pkg.name}.html`)).href);
  await page.locator('#speed').selectOption('0.5');
  await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('#board')!;
    const observer = new MutationObserver(() => {
      const partial = [...svg.querySelectorAll<SVGPathElement>('[data-kind="text"] [data-stroke]')].some((path) => {
        const offset = Number(path.style.strokeDashoffset);
        return path.style.visibility === 'visible' && offset > 0 && offset < path.getTotalLength();
      });
      if (partial) {
        observer.disconnect();
        document.querySelector<HTMLButtonElement>('#play')!.click();
        svg.dataset.sampled = 'true';
      }
    });
    observer.observe(svg, { attributes: true, subtree: true, attributeFilter: ['style'] });
  });
  await page.locator('#start').click();
  await expect(page.locator('#board')).toHaveAttribute('data-sampled', 'true', { timeout: 15_000 });
  await expect(page.locator('[data-pen]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('partial-stroke.png'), fullPage: true });
  await page.locator('#next').click();
  await expect(page.locator('#board')).toHaveAttribute('data-completed', '1');
  await page.locator('#previous').click();
  await expect(page.locator('#start-overlay')).toBeVisible();
});

test('presenter view is a borderless keyboard-driven whiteboard', async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve('presentations', `${pkg.name}.html`)).href);
  await page.locator('#instant').check();
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect(page.locator('#board')).toBeFocused();
  for (const selector of ['#controls', '.masthead', '.board-heading', '.beat-strip', '#detail-panel', '#start-overlay', '.app-footer']) {
    await expect(page.locator(selector)).toBeHidden();
  }
  const fits = await page.locator('#board').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.x === 0 && box.y === 0 && box.width === innerWidth && box.height === innerHeight;
  });
  expect(fits).toBe(true);
  expect(await page.locator('.paper').evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('0px');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#board')).toHaveAttribute('data-completed', '1');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#board')).toHaveAttribute('data-completed', '0');
  await expect(page.locator('#start-overlay')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('#start-overlay')).toBeVisible();
});
