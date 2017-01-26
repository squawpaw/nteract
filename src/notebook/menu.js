import {
  ipcRenderer as ipc,
  webFrame,
  remote,
} from 'electron';

import * as path from 'path';

import { tildify, launchFilename } from './native-window';

import { executeCell } from './epics/execute';

import {
  setTheme,
} from './epics/theming';

import {
  PUBLISH_GIST,
} from './epics/github-publish';


import {
  clearCellOutput,
  newKernel,
  killKernel,
  interruptKernel,
  copyCell,
  cutCell,
  pasteCell,
  createCellAfter,
} from './actions';

import {
  save,
  saveAs,
} from './epics/saving';

import { copyNotebook } from './utils';

const BrowserWindow = remote.BrowserWindow;

export function dispatchSaveAs(store, evt, filename) {
  const state = store.getState();
  const notebook = state.document.get('notebook');
  store.dispatch(saveAs(filename, notebook));
}

const remoteElectron = remote.require('electron');
const dialog = remoteElectron.dialog;

export function showSaveAsDialog(defaultPath) {
  return new Promise((resolve) => {
    const filename = dialog.showSaveDialog({
      title: 'Save Notebook',
      defaultPath,
      filters: [{ name: 'Notebooks', extensions: ['ipynb'] }],
    });

    if (filename && path.extname(filename) === '') {
      resolve(`${filename}.ipynb`);
    }
    resolve(filename);
  });
}

export function triggerSaveAs(store) {
  showSaveAsDialog()
    .then(filename => {
      if (!filename) {
        return;
      }
      const state = store.getState();
      const executionState = state.app.get('executionState');
      const notebook = state.document.get('notebook');
      store.dispatch(saveAs(filename, notebook));
      BrowserWindow.getFocusedWindow().setTitle(`${tildify(filename)} - ${executionState}`);
    }
  );
}

export function dispatchSave(store) {
  const state = store.getState();
  const notebook = state.document.get('notebook');
  const filename = state.metadata.get('filename');
  const notificationSystem = state.app.get('notificationSystem');
  try {
    if (!filename) {
      triggerSaveAs(store);
    } else {
      store.dispatch(save(filename, notebook));
    }
    notificationSystem.addNotification({
      title: 'Save successful!',
      autoDismiss: 2,
      level: 'success',
    });
  } catch (err) {
    notificationSystem.addNotification({
      title: 'Save failed!',
      message: err.message,
      level: 'error',
    });
  }
}

export function dispatchNewKernel(store, evt, name) {
  const state = store.getState();
  const spawnOptions = {};
  if (state && state.document && state.metadata.get('filename')) {
    spawnOptions.cwd = path.dirname(path.resolve(state.metadata.get('filename')));
  }
  store.dispatch(newKernel(name, spawnOptions));
}

export function dispatchPublishGist(store) {
  store.dispatch({ type: PUBLISH_GIST });
}

export function dispatchRunAll(store) {
  const state = store.getState();
  const notebook = state.document.get('notebook');
  const cells = notebook.get('cellMap');
  notebook.get('cellOrder').filter((cellID) =>
    cells.getIn([cellID, 'cell_type']) === 'code')
      .map((cellID) => store.dispatch(
        executeCell(
          cellID,
          cells.getIn([cellID, 'source'])
        )
  ));
}

export function dispatchClearAll(store) {
  const state = store.getState();
  const notebook = state.document.get('notebook');
  notebook.get('cellOrder').map((value) => store.dispatch(clearCellOutput(value)));
}

export function dispatchKillKernel(store) {
  store.dispatch(killKernel);
}

export function dispatchInterruptKernel(store) {
  const state = store.getState();
  const notificationSystem = state.app.get('notificationSystem');
  if (process.platform === 'win32') {
    notificationSystem.addNotification({
      title: 'Not supported in Windows',
      message: 'Kernel interruption is currently not supported in Windows.',
      level: 'error',
    });
  } else {
    store.dispatch(interruptKernel);
  }
}

export function dispatchRestartKernel(store) {
  const state = store.getState();
  const notificationSystem = state.app.get('notificationSystem');
  const spawnOptions = {};
  if (state && state.document && state.metadata.get('filename')) {
    spawnOptions.cwd = path.dirname(path.resolve(state.metadata.filename));
  }

  store.dispatch(killKernel);
  store.dispatch(newKernel(state.app.kernelSpecName, spawnOptions));

  notificationSystem.addNotification({
    title: 'Kernel Restarted',
    message: `Kernel ${state.app.kernelSpecName} has been restarted.`,
    dismissible: true,
    position: 'tr',
    level: 'success',
  });
}

export function dispatchRestartClearAll(store) {
  dispatchRestartKernel(store);
  dispatchClearAll(store);
}

export function dispatchZoomIn() {
  webFrame.setZoomLevel(webFrame.getZoomLevel() + 1);
}

export function dispatchZoomOut() {
  webFrame.setZoomLevel(webFrame.getZoomLevel() - 1);
}

export function dispatchDuplicate(store) {
  const state = store.getState();
  const notificationSystem = state.app.get('notificationSystem');
  const filename = state.metadata.get('filename');
  if (filename) {
    copyNotebook(filename).then((value) => {
      launchFilename(value);
    });
  } else {
    notificationSystem.addNotification({
      title: 'Can\'t Duplicate Unsaved Notebook',
      message: 'A notebook must be saved before it can be duplicated.',
      dismissble: true,
      position: 'tr',
      level: 'warning',
    });
  }
}

export function dispatchSetTheme(store, evt, theme) {
  store.dispatch(setTheme(theme));
}

export function dispatchCopyCell(store) {
  const state = store.getState();
  const focused = state.document.get('focusedCell');
  store.dispatch(copyCell(focused));
}

export function dispatchCutCell(store) {
  const state = store.getState();
  const focused = state.document.get('focusedCell');
  store.dispatch(cutCell(focused));
}

export function dispatchPasteCell(store) {
  store.dispatch(pasteCell());
}

export function dispatchCreateCellAfter(store) {
  const state = store.getState();
  const focused = state.document.get('focusedCell');
  store.dispatch(createCellAfter(focused));
}

export function initMenuHandlers(store) {
  ipc.on('menu:new-kernel', dispatchNewKernel.bind(null, store));
  ipc.on('menu:run-all', dispatchRunAll.bind(null, store));
  ipc.on('menu:clear-all', dispatchClearAll.bind(null, store));
  ipc.on('menu:save', dispatchSave.bind(null, store));
  ipc.on('menu:save-as', dispatchSaveAs.bind(null, store));
  ipc.on('menu:new-code-cell', dispatchCreateCellAfter.bind(null, store));
  ipc.on('menu:copy-cell', dispatchCopyCell.bind(null, store));
  ipc.on('menu:cut-cell', dispatchCutCell.bind(null, store));
  ipc.on('menu:paste-cell', dispatchPasteCell.bind(null, store));
  ipc.on('menu:duplicate-notebook', dispatchDuplicate.bind(null, store));
  ipc.on('menu:kill-kernel', dispatchKillKernel.bind(null, store));
  ipc.on('menu:interrupt-kernel', dispatchInterruptKernel.bind(null, store));
  ipc.on('menu:restart-kernel', dispatchRestartKernel.bind(null, store));
  ipc.on('menu:restart-and-clear-all', dispatchRestartClearAll.bind(null, store));
  ipc.on('menu:publish:gist', dispatchPublishGist.bind(null, store));
  ipc.on('menu:zoom-in', dispatchZoomIn.bind(null, store));
  ipc.on('menu:zoom-out', dispatchZoomOut.bind(null, store));
  ipc.on('menu:theme', dispatchSetTheme.bind(null, store));
}
