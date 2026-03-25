const path = require('node:path');

function buildNotebookUrl(baseLabUrl, notebookPath) {
  const parsed = new URL(baseLabUrl);
  const basePath = parsed.pathname.replace(/\/$/, '');
  parsed.pathname = `${basePath}/tree/${notebookPath}`;
  parsed.searchParams.set('reset', '1');
  return parsed.toString();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function dismissBlockingDialogs(page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const dialog = page.locator('dialog.jp-Dialog, [role="dialog"].jp-Dialog, [role="dialog"]').first();
    if (!(await dialog.count()) || !(await dialog.isVisible())) {
      return;
    }

    const noKernelButton = page.getByRole('button', { name: /^No Kernel$/ }).first();
    if ((await noKernelButton.count()) > 0 && (await noKernelButton.isVisible())) {
      await noKernelButton.click();
      await page.waitForTimeout(120);
      continue;
    }

    const selectKernelButton = page.getByRole('button', { name: /^Select$/ }).first();
    if ((await selectKernelButton.count()) > 0 && (await selectKernelButton.isVisible())) {
      await selectKernelButton.click();
      await page.waitForTimeout(120);
      continue;
    }

    const cancelButton = page.getByRole('button', { name: /^Cancel$/ }).first();
    if ((await cancelButton.count()) > 0 && (await cancelButton.isVisible())) {
      await cancelButton.click();
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
  await page.getByRole('list', { name: /files/i }).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
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
  await item.first().waitFor({ state: 'visible', timeout: 20000 });
  await item.first().dblclick();
  await dismissBlockingDialogs(page);
}

async function activateDocumentTab(page, documentName) {
  await dismissBlockingDialogs(page);
  const exactTab = page
    .getByRole('tab', { name: new RegExp(`^${escapeRegExp(documentName)}$`) })
    .first();
  await exactTab.click();
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
  await codexSideTab.click();
  await expect(composer.first()).toBeVisible({ timeout: 20000 });
}

async function openNotebookInCodex(page, baseURL, notebook) {
  const commandPath = notebook.commandPath || path.resolve(__dirname, 'mock-codex-cli.py');
  await page.addInitScript(cmd => {
    window.localStorage.setItem('jupyterlab-codex:command-path', cmd);
    if (!window.localStorage.getItem('jupyterlab-codex:model')) {
      window.localStorage.removeItem('jupyterlab-codex:model');
    }
  }, commandPath);

  const targetUrl = buildNotebookUrl(baseURL, notebook.path);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main[aria-label="Main Content"], .jp-LabShell, .lm-DockPanel', { timeout: 30000 });
  await dismissBlockingDialogs(page);
  await ensureCodexPanel(page);

  await openDocumentFromFileBrowser(page, notebook.name);
  await activateDocumentTab(page, notebook.name);
}

module.exports = {
  buildNotebookUrl,
  dismissBlockingDialogs,
  ensureFileBrowserVisible,
  openDocumentFromFileBrowser,
  activateDocumentTab,
  ensureCodexPanel,
  openNotebookInCodex
};
