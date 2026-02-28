import React, { memo, useMemo, useState } from 'react';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { formatSelectionPreviewTextForDisplay } from './codexChatDocumentUtils';

marked.use(
  markedKatex({
    throwOnError: false
  })
);

type MessageBlock =
  | { kind: 'text'; text: string }
  | { kind: 'code'; lang: string; code: string };

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export function splitFencedCodeBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let rest = text;

  while (rest.length > 0) {
    const fenceStart = rest.indexOf('```');
    if (fenceStart === -1) {
      blocks.push({ kind: 'text', text: rest });
      break;
    }

    if (fenceStart > 0) {
      blocks.push({ kind: 'text', text: rest.slice(0, fenceStart) });
    }

    const afterFence = rest.slice(fenceStart + 3);
    const fenceEnd = afterFence.indexOf('```');
    if (fenceEnd === -1) {
      blocks.push({ kind: 'text', text: rest.slice(fenceStart) });
      break;
    }

    const raw = afterFence.slice(0, fenceEnd);
    rest = afterFence.slice(fenceEnd + 3);

    let lang = '';
    let code = raw;
    const firstNewline = raw.indexOf('\n');
    if (firstNewline !== -1) {
      const candidate = raw.slice(0, firstNewline).trim();
      if (candidate.length > 0 && candidate.length <= 20 && /^[A-Za-z0-9+#_.-]+$/.test(candidate)) {
        lang = candidate;
        code = raw.slice(firstNewline + 1);
      }
    }
    blocks.push({ kind: 'code', lang, code: code.replace(/\n$/, '') });
  }

  return blocks.filter(block => (block.kind === 'text' ? block.text.length > 0 : true));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHighlightLanguage(lang: string): string {
  const normalized = lang.trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  const aliasMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    'c++': 'cpp',
    'c#': 'csharp',
    'objective-c': 'objectivec',
    objc: 'objectivec'
  };
  return aliasMap[normalized] ?? normalized;
}

export function renderHighlightedCodeToSafeHtml(code: string, lang: string): string {
  const fallback = escapeHtml(code);
  let highlighted = fallback;
  try {
    const normalizedLang = normalizeHighlightLanguage(lang);
    if (normalizedLang && hljs.getLanguage(normalizedLang)) {
      highlighted = hljs.highlight(code, { language: normalizedLang, ignoreIllegals: true }).value;
    } else {
      highlighted = hljs.highlightAuto(code).value;
    }
  } catch {
    highlighted = fallback;
  }
  try {
    return DOMPurify.sanitize(highlighted, { USE_PROFILES: { html: true } });
  } catch {
    return escapeHtml(highlighted);
  }
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  if (!markdown) {
    return '';
  }
  const normalizedMarkdown = normalizeMathDelimiters(markdown);
  let html = '';
  try {
    html = marked.parse(normalizedMarkdown, {
      gfm: true,
      breaks: true
    }) as string;
  } catch {
    return escapeHtml(markdown).replace(/\n/g, '<br />');
  }
  try {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  } catch {
    return escapeHtml(markdown).replace(/\n/g, '<br />');
  }
}

function normalizeMathDelimiters(markdown: string): string {
  const normalizedEscapedBlock = markdown.replace(
    /(^|[^\\])\\\[([\s\S]*?)\\\]/g,
    (_match, prefix: string, body: string) => `${prefix}\n$$\n${body}\n$$\n`
  );

  const normalizedEscapedInline = normalizedEscapedBlock.replace(
    /(^|[^\\])\\\((.+?)\\\)/g,
    (_match, prefix: string, body: string) => `${prefix}$${body}$`
  );

  return normalizedEscapedInline.replace(
    /(^|\n)[ \t]*\[\s*\n([\s\S]*?)\n[ \t]*\](?=\n|$)/g,
    (_match, prefix: string, body: string) => {
      const trimmed = body.trim();
      if (!looksLikeLatexMath(trimmed)) {
        return `${prefix}[\n${body}\n]`;
      }
      return `${prefix}\n$$\n${trimmed}\n$$\n`;
    }
  );
}

function looksLikeLatexMath(value: string): boolean {
  if (!value) {
    return false;
  }
  return /\\[A-Za-z]+/.test(value) || /[_^{}]/.test(value);
}

export function StatusPill(props: { status: 'disconnected' | 'ready' | 'running' }): JSX.Element {
  const label =
    props.status === 'disconnected' ? 'Disconnected' : props.status === 'running' ? 'Running' : 'Ready';
  return (
    <span
      className={`jp-CodexStatusPill jp-CodexStatusPill-${props.status}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <span className="jp-CodexStatusPill-dot" aria-hidden="true" />
    </span>
  );
}

const CodeBlock = memo(function CodeBlock(props: { lang: string; code: string; canCopy: boolean }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const highlightedCode = useMemo(
    () => renderHighlightedCodeToSafeHtml(props.code, props.lang),
    [props.code, props.lang]
  );

  async function onCopy(): Promise<void> {
    const ok = await copyToClipboard(props.code);
    if (!ok) {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 900);
  }

  return (
    <div className="jp-CodexCodeBlockWrap">
      <div className="jp-CodexCodeBlockBar">
        <span className="jp-CodexCodeBlockMeta">
          {props.lang ? <span className="jp-CodexCodeBlockLang">{props.lang}</span> : <span />}
        </span>
        {props.canCopy && (
          <button
            className="jp-CodexBtn jp-CodexBtn-ghost jp-CodexBtn-xs jp-CodexCodeBlockCopyBtn"
            onClick={() => void onCopy()}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <pre className="jp-CodexCodeBlock">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </pre>
    </div>
  );
});

CodeBlock.displayName = 'CodeBlock';

export const MessageText = memo(function MessageText(props: { text: string; canCopyCode?: boolean }): JSX.Element {
  const blocks = splitFencedCodeBlocks(props.text);
  return (
    <div className="jp-CodexChat-text">
      {blocks.map((block, idx) => {
        if (block.kind === 'code') {
          return <CodeBlock key={idx} lang={block.lang} code={block.code} canCopy={Boolean(props.canCopyCode)} />;
        }
        const html = renderMarkdownToSafeHtml(block.text);
        return <div key={idx} className="jp-CodexMarkdown" dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}, (a, b) => a.text === b.text && Boolean(a.canCopyCode) === Boolean(b.canCopyCode));

MessageText.displayName = 'MessageText';

export function SelectionPreviewCode(props: { code: string }): JSX.Element {
  const displayCode = formatSelectionPreviewTextForDisplay(props.code);
  const highlightedCode = useMemo(
    () => renderHighlightedCodeToSafeHtml(displayCode, ''),
    [displayCode]
  );
  return (
    <pre className="jp-CodexCodeBlock jp-CodexChat-selectionCode">
      <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
    </pre>
  );
}
