import React, { useEffect, useRef, useState } from 'react';
import { ReactWidget, Dialog, showDialog } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ServerConnection, URLExt } from '@jupyterlab/services';
import type { DocumentRegistry } from '@jupyterlab/docregistry';

export class CodexPanel extends ReactWidget {
  private _notebooks: INotebookTracker;
  private _currentContext: DocumentRegistry.IContext | null = null;

  constructor(notebooks: INotebookTracker) {
    super();
    this._notebooks = notebooks;
    this.addClass('jp-CodexPanel');

    this._notebooks.currentChanged.connect(this._onNotebookChanged, this);
    this._onNotebookChanged();
  }

  render(): JSX.Element {
    return <CodexChat notebooks={this._notebooks} />;
  }

  private _onNotebookChanged(): void {
    if (this._currentContext) {
      this._currentContext.fileChanged.disconnect(this._onFileChanged, this);
    }

    const widget = this._notebooks.currentWidget;
    this._currentContext = widget ? widget.context : null;

    if (this._currentContext) {
      this._currentContext.fileChanged.connect(this._onFileChanged, this);
    }
  }

  private async _onFileChanged(): Promise<void> {
    if (!this._currentContext) {
      return;
    }

    const result = await showDialog({
      title: 'File changed on disk',
      body: 'The paired Jupytext file was modified. Reload this notebook?\n(Unsaved changes will be lost.)',
      buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Reload' })]
    });

    if (result.button.accept) {
      await this._currentContext.revert();
    }
  }
}

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

type CodexChatProps = {
  notebooks: INotebookTracker;
};

function CodexChat(props: CodexChatProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'disconnected' | 'ready' | 'running'>('disconnected');
  const [attachCell, setAttachCell] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    const settings = ServerConnection.makeSettings();
    const wsUrl = URLExt.join(settings.wsUrl, 'codex', 'ws');
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      setStatus('ready');
      const notebookPath = getNotebookPath(props.notebooks);
      socket.send(
        JSON.stringify({
          type: 'start_session',
          sessionId: sessionIdRef.current,
          notebookPath
        })
      );
    };

    socket.onclose = () => {
      setStatus('disconnected');
    };

    socket.onmessage = event => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        appendSystem(`Invalid message: ${String(event.data)}`);
        return;
      }

      if (msg.type === 'status') {
        setStatus(msg.state || 'ready');
        return;
      }

      if (msg.type === 'output') {
        appendAssistant(msg.text || '');
        return;
      }

      if (msg.type === 'error') {
        appendSystem(msg.message || 'Unknown error');
        return;
      }

      if (msg.type === 'event') {
        const text = msg.payload ? JSON.stringify(msg.payload) : '';
        if (text) {
          appendSystem(text);
        }
      }
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [props.notebooks]);

  function appendAssistant(text: string): void {
    if (!text) {
      return;
    }

    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') {
        return [...prev, { role: 'assistant', text }];
      }
      const updated = { ...last, text: last.text + text };
      return [...prev.slice(0, -1), updated];
    });
  }

  function appendSystem(text: string): void {
    setMessages(prev => [...prev, { role: 'system', text }]);
  }

  function sendMessage(): void {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendSystem('WebSocket is not connected.');
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const selection = attachCell ? getActiveCellText(props.notebooks) : '';

    socket.send(
      JSON.stringify({
        type: 'send',
        sessionId: sessionIdRef.current,
        content: trimmed,
        selection
      })
    );

    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setStatus('running');
  }

  return (
    <div className="jp-CodexChat">
      <div className="jp-CodexChat-header">
        <span className={`jp-CodexChat-status jp-CodexChat-status-${status}`}>{status}</span>
        <label className="jp-CodexChat-toggle">
          <input
            type="checkbox"
            checked={attachCell}
            onChange={e => setAttachCell(e.currentTarget.checked)}
          />
          Attach active cell
        </label>
      </div>
      <div className="jp-CodexChat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`jp-CodexChat-message jp-CodexChat-${msg.role}`}>
            <div className="jp-CodexChat-role">{msg.role}</div>
            <div className="jp-CodexChat-text">{msg.text}</div>
          </div>
        ))}
      </div>
      <div className="jp-CodexChat-input">
        <textarea
          value={input}
          onChange={e => setInput(e.currentTarget.value)}
          placeholder="Ask Codex..."
          rows={3}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

function getNotebookPath(notebooks: INotebookTracker): string {
  return notebooks.currentWidget ? notebooks.currentWidget.context.path : '';
}

function getActiveCellText(notebooks: INotebookTracker): string {
  const widget = notebooks.currentWidget;
  if (!widget) {
    return '';
  }
  const activeCell = widget.content.activeCell;
  return activeCell ? activeCell.model.value.text : '';
}
