import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { CodexPanel } from './panel';
import '../style/index.css';

const PLUGIN_ID = 'jupyterlab-codex:plugin';

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker],
  activate: (app: JupyterFrontEnd, palette: ICommandPalette, notebooks: INotebookTracker) => {
    const panel = new CodexPanel(app, notebooks);
    panel.id = 'jupyterlab-codex-sidebar';
    panel.title.caption = 'Codex';
    panel.title.label = 'Codex';

    app.shell.add(panel, 'right');

    palette.addItem({
      command: 'jupyterlab-codex:activate',
      category: 'Codex'
    });

    app.commands.addCommand('jupyterlab-codex:activate', {
      label: 'Focus Codex Sidebar',
      execute: () => {
        app.shell.activateById(panel.id);
      }
    });
  }
};

export default plugin;
