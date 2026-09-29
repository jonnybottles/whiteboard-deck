import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import type {} from '../src/export/capture.ts';

export interface CaptureSession {
  page: Page;
  check(): void;
  close(): Promise<void>;
}

export async function openCapture(root: string, stage: string): Promise<CaptureSession> {
  const output = join(stage, 'capture');
  await build({
    configFile: false, root, base: './', publicDir: false, logLevel: 'error',
    plugins: [viteSingleFile({ removeViteModuleLoader: true })],
    build: {
      outDir: output, emptyOutDir: true, target: 'es2022', sourcemap: false,
      modulePreload: false, reportCompressedSize: false,
      rollupOptions: { input: join(root, 'src', 'export', 'capture.html') },
    },
  });
  let browser: Browser | undefined;
  const failures: string[] = [];
  for (const channel of ['msedge', 'chrome']) {
    try { browser = await chromium.launch({ channel, headless: true }); break; }
    catch (error) { failures.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (!browser) throw new Error(`PPTX export requires an installed Edge or Chrome. No browser was downloaded.\n${failures.join('\n')}`);
  const errors: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2, offline: true });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (/^https?:/i.test(request.url())) errors.push(`External export request: ${request.url()}`); });
    await page.goto(pathToFileURL(join(output, 'src', 'export', 'capture.html')).href);
    await page.waitForFunction(() => !!window.whiteboardExport);
    return {
      page,
      check() { if (errors.length) throw new Error(errors.join('\n')); },
      close: () => browser.close(),
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
