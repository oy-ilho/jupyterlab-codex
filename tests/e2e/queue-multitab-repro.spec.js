const path = require('path');
const { test, expect } = require('@playwright/test');

const NOTEBOOKS = [
  { path: 'tests/e2e/fixtures/notebooks/tab1.ipynb', name: 'tab1.ipynb' },
  { path: 'tests/e2e/fixtures/notebooks/tab2.ipynb', name: 'tab2.ipynb' },
  { path: 'tests/e2e/fixtures/notebooks/tab3.ipynb', name: 'tab3.ipynb' }
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildInitialNotebookUrl(baseLabUrl, notebookPath) {
  const parsed = new URL(baseLabUrl);
  const basePath = parsed.pathname.replace(/\/$/, '');
  parsed.pathname = `${basePath}/tree/${notebookPath}`;
  parsed.searchParams.set('reset', '1');
  return parsed.toString();
}

async function dismissBlockingDialogs(page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const dialog = page.locator('dialog.jp-Dialog, [role="dialog"].jp-Dialog, [role="dialog"]').first();
    if (!(await dialog.count()) || !(await dialog.isVisible())) {
      return;
    }

    const noKernelButton = page.getByRole('button', { name: /^No Kernel$/ }).first();
    if ((await noKernelButton.count()) > 0 && (await noKernelButton.isVisible())) {
      await noKernelButton.click();
      await page.waitForTimeout(150);
      continue;
    }

    const selectKernelButton = page.getByRole('button', { name: /^Select Kernel$/ }).first();
    if ((await selectKernelButton.count()) > 0 && (await selectKernelButton.isVisible())) {
      await selectKernelButton.click();
      await page.waitForTimeout(150);
      continue;
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}

async function ensureFileBrowserVisible(page) {
  await dismissBlockingDialogs(page);
  const fileBrowserTab = page.getByRole('tab', { name: /File Browser/i }).first();
  if (await fileBrowserTab.count()) {
    const isActiveBefore = await fileBrowserTab.evaluate(
      element =>
        element.getAttribute('aria-selected') === 'true' ||
        (typeof element.className === 'string' && element.className.includes('lm-mod-current'))
    );
    if (!isActiveBefore) {
      await fileBrowserTab.click();
    }
    const isActiveAfter = await fileBrowserTab.evaluate(
      element =>
        element.getAttribute('aria-selected') === 'true' ||
        (typeof element.className === 'string' && element.className.includes('lm-mod-current'))
    );
    if (!isActiveAfter) {
      await fileBrowserTab.click();
    }
  }
  await expect(page.locator('.jp-BreadCrumbs-home')).toBeVisible({ timeout: 10000 });
}

async function openNotebookFromFileBrowser(page, notebookName) {
  await ensureFileBrowserVisible(page);
  let item = page
    .getByRole('listitem', { name: new RegExp(`\\b${escapeRegExp(notebookName)}\\b`, 'i') })
    .first();
  if (!(await item.count())) {
    item = page.locator('.jp-DirListing-item', { hasText: notebookName }).first();
  }
  if (!(await item.count())) {
    item = page.locator('.jp-FileBrowser').getByText(notebookName, { exact: true }).first();
  }
  await expect(item).toBeVisible({ timeout: 20000 });
  await item.dblclick();
  await dismissBlockingDialogs(page);
}

async function activateNotebookTab(page, notebookName) {
  await dismissBlockingDialogs(page);
  const tab = page.getByRole('tab', { name: new RegExp(`^${escapeRegExp(notebookName)}$`) }).first();
  await expect(tab).toBeVisible({ timeout: 20000 });
  await tab.click();
  await expect(page.locator('.jp-CodexChat-notebook')).toHaveText(notebookName, { timeout: 20000 });
}

async function ensureCodexPanel(page) {
  await dismissBlockingDialogs(page);
  const composer = page.locator('.jp-CodexPanel .jp-CodexComposer textarea');
  if ((await composer.count()) > 0 && (await composer.first().isVisible())) {
    return;
  }

  const codexSideTab = page
    .locator('.jp-SideBar.jp-mod-right .lm-TabBar-tab[title="Codex"], .jp-SideBar.jp-mod-right .lm-TabBar-tab')
    .filter({ hasText: 'Codex' })
    .first();
  await expect(codexSideTab).toBeVisible({ timeout: 20000 });
  await codexSideTab.click();

  if ((await composer.count()) > 0) {
    await expect(composer.first()).toBeVisible({ timeout: 20000 });
    return;
  }
  throw new Error('Codex panel could not be activated from right sidebar tab.');
}

async function sendMessage(page, text) {
  await dismissBlockingDialogs(page);
  const composer = page.locator('.jp-CodexComposer textarea');
  const sendBtn = page.locator('.jp-CodexSendBtn');

  await expect(composer).toBeVisible();
  await composer.fill(text);
  await expect(sendBtn).toBeEnabled({ timeout: 15000 });
  await sendBtn.click();
  await expect(page.locator('.jp-CodexSendBtn.is-stop')).toBeVisible({ timeout: 15000 });
}

test('rapid 3-tab send while in-flight does not freeze Codex sidebar', async ({ page, baseURL }) => {
  const codexCommandPath =
    process.env.PLAYWRIGHT_CODEX_COMMAND || path.resolve(__dirname, 'mock-codex-cli.py');
  const targetUrl = baseURL || process.env.JUPYTERLAB_URL || 'http://127.0.0.1:8888/lab';
  const initialNotebookUrl = buildInitialNotebookUrl(targetUrl, NOTEBOOKS[0].path);
  const pageErrors = [];
  const codexConsoleErrors = [];

  page.on('pageerror', err => {
    pageErrors.push(String(err?.message || err));
  });
  page.on('console', msg => {
    if (msg.type() !== 'error') {
      return;
    }
    const text = msg.text();
    if (text.includes('[Codex] onSocketMessage failed') || text.includes('WebSocketClosedError')) {
      codexConsoleErrors.push(text);
    }
  });

  await page.addInitScript(commandPath => {
    window.localStorage.setItem('jupyterlab-codex:command-path', commandPath);
  }, codexCommandPath);

  await page.goto(initialNotebookUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main[aria-label="Main Content"], .jp-LabShell, .lm-DockPanel', {
    timeout: 30000
  });
  await dismissBlockingDialogs(page);
  await ensureCodexPanel(page);

  for (const notebook of NOTEBOOKS.slice(1)) {
    await openNotebookFromFileBrowser(page, notebook.name);
  }

  let sendIndex = 1;
  for (const notebook of NOTEBOOKS) {
    await activateNotebookTab(page, notebook.name);
    await sendMessage(page, `playwright-multitab-repro-${sendIndex}`);
    sendIndex += 1;
  }

  // While runs are in-flight, switch tabs rapidly to stress session/socket mapping.
  for (let round = 0; round < 2; round += 1) {
    for (const notebook of NOTEBOOKS) {
      await activateNotebookTab(page, notebook.name);
      await page.waitForTimeout(120);
    }
  }

  for (const notebook of NOTEBOOKS) {
    await activateNotebookTab(page, notebook.name);
    await expect(page.locator('.jp-CodexSendBtn.is-stop')).toHaveCount(0, { timeout: 45000 });
  }

  await expect(page.locator('.jp-CodexChat-reconnectNotice')).toHaveCount(0);
  await expect(page.getByText('Internal UI error while processing a server message')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(codexConsoleErrors).toEqual([]);
});
