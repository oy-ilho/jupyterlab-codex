const path = require('path');
const { test, expect } = require('@playwright/test');

const DOCS = [
  { path: 'tests/e2e/fixtures/notebooks/tab1.py', name: 'tab1.py', kind: 'py' },
  { path: 'tests/e2e/fixtures/notebooks/tab2.py', name: 'tab2.py', kind: 'py' },
  { path: 'tests/e2e/fixtures/notebooks/tab3.py', name: 'tab3.py', kind: 'py' },
  { path: 'tests/e2e/fixtures/notebooks/tab4.py', name: 'tab4.py', kind: 'py' }
];

const STRESS_PROMPT = '양자역학을 시뮬레이팅하는 코드를 작성해줘';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildInitialDocumentUrl(baseLabUrl, documentPath) {
  const parsed = new URL(baseLabUrl);
  const basePath = parsed.pathname.replace(/\/$/, '');
  parsed.pathname = `${basePath}/tree/${documentPath}`;
  parsed.searchParams.set('reset', '1');
  return parsed.toString();
}

async function dismissBlockingDialogs(page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const dialog = page.locator('dialog.jp-Dialog, [role="dialog"].jp-Dialog, [role="dialog"]').first();
    if (!(await dialog.count()) || !(await dialog.isVisible())) {
      return;
    }

    const clickedNoKernel = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll('dialog.jp-Dialog button, [role="dialog"] button')
      );
      const target = buttons.find(button => /No Kernel/i.test(button.textContent || ''));
      if (!target) {
        return false;
      }
      target.click();
      return true;
    });
    if (clickedNoKernel) {
      await page.waitForTimeout(120);
      continue;
    }

    const clickedSelect = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll('dialog.jp-Dialog button, [role="dialog"] button')
      );
      const target = buttons.find(button => /^Select$/i.test((button.textContent || '').trim()));
      if (!target) {
        return false;
      }
      target.click();
      return true;
    });
    if (clickedSelect) {
      await page.waitForTimeout(120);
      continue;
    }

    const clickedCancel = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll('dialog.jp-Dialog button, [role="dialog"] button')
      );
      const target = buttons.find(button => /^Cancel$/i.test((button.textContent || '').trim()));
      if (!target) {
        return false;
      }
      target.click();
      return true;
    });
    if (clickedCancel) {
      await page.waitForTimeout(120);
      continue;
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
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

async function openDocumentFromFileBrowser(page, documentName) {
  await ensureFileBrowserVisible(page);
  let item = page
    .getByRole('listitem', { name: new RegExp(`\\b${escapeRegExp(documentName)}\\b`, 'i') })
    .first();
  if (!(await item.count())) {
    item = page.locator('.jp-DirListing-item', { hasText: documentName }).first();
  }
  if (!(await item.count())) {
    item = page.locator('.jp-FileBrowser').getByText(documentName, { exact: true }).first();
  }
  await expect(item).toBeVisible({ timeout: 20000 });
  await dismissBlockingDialogs(page);
  await item.dblclick();
  await dismissBlockingDialogs(page);
}

async function activateDocumentTab(page, documentName) {
  await dismissBlockingDialogs(page);
  const exactTab = page.getByRole('tab', { name: new RegExp(`^${escapeRegExp(documentName)}$`) }).first();
  await expect(exactTab).toBeVisible({ timeout: 20000 });
  await exactTab.click();
  await expect(page.locator('.jp-CodexChat-notebook')).toHaveText(documentName, { timeout: 20000 });
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

  await expect(composer.first()).toBeVisible({ timeout: 20000 });
}

async function sendMessage(page, text) {
  await dismissBlockingDialogs(page);
  const composer = page.locator('.jp-CodexComposer textarea');
  const sendBtn = page.locator('.jp-CodexSendBtn:visible');

  await expect(composer).toBeVisible({ timeout: 20000 });
  await composer.fill(text);
  const isEnabled = await sendBtn.isEnabled();
  if (!isEnabled) {
    return false;
  }
  await sendBtn.click();
  await expect(page.locator('.jp-CodexSendBtn.is-stop')).toBeVisible({ timeout: 15000 });
  return true;
}

async function sendMessageFromCurrentTab(page, text, options = {}) {
  const sendAllowed = options.sendAllowed ?? true;
  await dismissBlockingDialogs(page);
  const composer = page.locator('.jp-CodexComposer textarea');
  const sendBtn = page.locator('.jp-CodexSendBtn:visible');

  await expect(composer).toBeVisible({ timeout: 20000 });
  await composer.fill(text);

  const isEnabled = await sendBtn.isEnabled();
  if (!sendAllowed) {
    expect(isEnabled).toBe(false);
    return false;
  }
  if (!isEnabled) {
    return false;
  }

  await sendBtn.click();
  await expect(page.locator('.jp-CodexSendBtn.is-stop')).toBeVisible({ timeout: 15000 });
  return true;
}

async function keepLastPyTabInteractive(page, durationMs = 15000) {
  const editor = page
    .locator('.jp-FileEditor .cm-content:visible, .jp-CodeMirrorEditor .cm-content:visible')
    .first();
  await expect(editor).toBeVisible({ timeout: 20000 });

  const probe = `PW_UI_RESPONSIVE_PROBE_MARKER_${Date.now()}`;
  await editor.click({ timeout: 5000 });
  await page.keyboard.type(`\n# ${probe}`);
  await expect(editor).toContainText(probe, { timeout: 5000 });

  const deadline = Date.now() + durationMs;
  let round = 0;
  while (Date.now() < deadline) {
    try {
      await editor.click({ timeout: 1000 });
      const marker = `PW_UI_RESPONSIVE_ROUND_${round}`;
      await page.keyboard.type(`\n# ${marker}`);
      await expect(editor).toContainText(marker, { timeout: 1000 });
      await page.mouse.wheel(0, 420);
      await page.mouse.wheel(0, -420);
    } catch (err) {
      const dismissed = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('dialog.jp-Dialog button, [role="dialog"] button'));
        const target = buttons.find(button =>
          /^(No Kernel|Cancel|Reload|Select)$/i.test((button.textContent || '').trim())
        );
        if (!target) {
          return false;
        }
        target.click();
        return true;
      });
      if (!dismissed) {
        throw err;
      }
    }
    round += 1;
    await page.waitForTimeout(80);
  }
}

test('4 notebook-tab rapid sends with immediate tab switching keep final .py tab interactive', async ({ page, baseURL }) => {
  const codexCommandPath =
    process.env.PLAYWRIGHT_CODEX_COMMAND || path.resolve(__dirname, 'mock-codex-cli-flood.py');
  const targetUrl = baseURL || process.env.JUPYTERLAB_URL || 'http://127.0.0.1:8888/lab';
  const interactiveMsRaw = Number(process.env.PLAYWRIGHT_INTERACTIVE_MS || '60000');
  const interactiveMs = Number.isFinite(interactiveMsRaw) ? Math.max(1000, Math.floor(interactiveMsRaw)) : 18000;
  const initialDocumentUrl = buildInitialDocumentUrl(targetUrl, DOCS[0].path);
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
    if (text.includes('[Codex] onSocketMessage failed') || text.includes('Internal UI error')) {
      codexConsoleErrors.push(text);
    }
  });

  await page.addInitScript(commandPath => {
    window.localStorage.setItem('jupyterlab-codex:command-path', commandPath);
    window.localStorage.setItem('jupyterlab-codex:model', 'gpt-5.3-codex');
    window.localStorage.setItem('jupyterlab-codex:reasoning-effort', 'high');
  }, codexCommandPath);

  await page.goto(initialDocumentUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main[aria-label="Main Content"], .jp-LabShell, .lm-DockPanel', {
    timeout: 30000
  });
  await dismissBlockingDialogs(page);
  await ensureCodexPanel(page);

  for (const document of DOCS.slice(1)) {
    await openDocumentFromFileBrowser(page, document.name);
  }

  for (const document of DOCS.slice(0, 1)) {
    await activateDocumentTab(page, document.name);
    const sent = await sendMessage(page, STRESS_PROMPT);
    expect(sent).toBe(true);
  }

  for (let round = 0; round < 5; round += 1) {
    for (const document of DOCS.slice(1)) {
      await activateDocumentTab(page, document.name);
      const sent = await sendMessageFromCurrentTab(page, STRESS_PROMPT, { sendAllowed: false });
      expect(sent).toBe(false);
  await expect(page.locator('.jp-CodexSendBtn:visible')).toBeDisabled({ timeout: 5000 });
    }
  }

  const lastDoc = DOCS[DOCS.length - 1];
  await activateDocumentTab(page, lastDoc.name);
  await keepLastPyTabInteractive(page, interactiveMs);

  await expect(page.locator('.jp-CodexChat-reconnectNotice')).toHaveCount(0);
  await expect(page.getByText('Internal UI error while processing a server message')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(codexConsoleErrors).toEqual([]);
});
