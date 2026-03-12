const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const NOTEBOOK_RELATIVE_PATH = 'tests/e2e/fixtures/notebooks/error-output-tail.ipynb';
const NOTEBOOK_NAME = 'error-output-tail.ipynb';
const NOTEBOOK_PY_PATH = path.resolve(__dirname, 'fixtures/notebooks/error-output-tail.py');
const NOTEBOOK_IPYNB_PATH = path.resolve(__dirname, 'fixtures/notebooks/error-output-tail.ipynb');
const TRACE_HEAD_MARKER = 'TRACE_HEAD_MARKER_ABCDEFGHIJ';
const TRACE_TAIL_MARKER = 'TRACE_TAIL_MARKER_ZYXWVUTSRQ';

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

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
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

function writeNotebookFixture() {
  const traceback = [
    'Traceback (most recent call last):',
    `  ${TRACE_HEAD_MARKER}`,
    `${'A'.repeat(22000)}`,
    `ValueError: ${TRACE_TAIL_MARKER}`
  ];
  const notebook = {
    cells: [
      {
        cell_type: 'code',
        execution_count: 1,
        id: 'error-output-tail-cell',
        metadata: {},
        outputs: [
          {
            output_type: 'error',
            ename: 'ValueError',
            evalue: TRACE_TAIL_MARKER,
            traceback
          }
        ],
        source: ['raise ValueError("synthetic traceback for tail truncation test")\n']
      }
    ],
    metadata: {
      jupytext: {
        formats: 'ipynb,py:percent'
      },
      kernelspec: {
        display_name: 'Python 3 (ipykernel)',
        language: 'python',
        name: 'python3'
      },
      language_info: {
        codemirror_mode: {
          name: 'ipython',
          version: 3
        },
        file_extension: '.py',
        mimetype: 'text/x-python',
        name: 'python',
        nbconvert_exporter: 'python',
        pygments_lexer: 'ipython3',
        version: '3.13.9'
      }
    },
    nbformat: 4,
    nbformat_minor: 5
  };

  fs.writeFileSync(NOTEBOOK_IPYNB_PATH, `${JSON.stringify(notebook, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    NOTEBOOK_PY_PATH,
    [
      '# %%',
      'raise ValueError("synthetic traceback for tail truncation test")',
      ''
    ].join('\n'),
    'utf8'
  );
}

test('error cell output sends the tail of the traceback to Codex', async ({ page, baseURL }) => {
  writeNotebookFixture();
  const codexCommandPath =
    process.env.PLAYWRIGHT_CODEX_COMMAND || path.resolve(__dirname, 'mock-codex-cli-prompt-echo.py');
  const targetUrl = baseURL || process.env.JUPYTERLAB_URL || 'http://127.0.0.1:8888/lab';

  await page.addInitScript(commandPath => {
    window.localStorage.setItem('jupyterlab-codex:command-path', commandPath);
    window.localStorage.setItem('jupyterlab-codex:include-active-cell', 'true');
    window.localStorage.setItem('jupyterlab-codex:include-active-cell-output', 'true');
  }, codexCommandPath);

  await page.goto(buildInitialNotebookUrl(targetUrl, NOTEBOOK_RELATIVE_PATH), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main[aria-label="Main Content"], .jp-LabShell, .lm-DockPanel', {
    timeout: 30000
  });
  await dismissBlockingDialogs(page);
  await ensureCodexPanel(page);

  const notebookCell = page.locator('.jp-Notebook .jp-Cell').first();
  await expect(notebookCell).toBeVisible({ timeout: 20000 });
  await notebookCell.click();

  const composer = page.locator('.jp-CodexComposer textarea');
  const sendBtn = page.locator('.jp-CodexSendBtn');
  await composer.fill('Inspect the attached output.');
  await expect(sendBtn).toBeEnabled({ timeout: 15000 });
  await sendBtn.click();
  await expect(page.locator('.jp-CodexSendBtn.is-stop')).toHaveCount(0, { timeout: 30000 });

  const assistantMessage = page.locator('.jp-CodexChat-message.jp-mod-assistant').last();
  await expect(assistantMessage).toContainText('PROMPT_TAIL_START', { timeout: 30000 });
  const responseText = await assistantMessage.innerText();

  const tailSection = responseText.split('PROMPT_TAIL_START\n')[1]?.split('\nPROMPT_TAIL_END')[0] || '';
  expect(tailSection).toContain(TRACE_TAIL_MARKER);
  expect(tailSection).not.toContain(TRACE_HEAD_MARKER);
  expect(responseText).toContain('Current Cell Output:');
});
