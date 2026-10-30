// StudioImportModel's entry points on the web. Guard, extension check, decoding and the review
// live in `importStore` and `appStore`; here is what a browser adds: the file input stands in for
// NSOpenPanel, a dropped file goes through the same guard, and the size check happens before a
// huge file is read (`BalloonSTL.open`, STLImport.swift:49-50).

import { core } from '#core/parameters';
import { CoreFailure, STL_ERRORS } from '../core/api';
import { useAppStore, useImportStore, type OpenableFile } from '../stores';

/** `chooseFile`: commits and shows the panel unless a file is being opened or reviewed. */
export const chooseFile = (showPanel: () => void): void => {
  if (useImportStore.getState().chooseFile()) showPanel();
};

const withSizeCheck = (file: File): OpenableFile => ({
  name: file.name,
  text: () => file.text(),
  arrayBuffer: () => (file.size > core.stl.maximumBytes ? Promise.reject(new CoreFailure('invalid-stl', STL_ERRORS.tooLarge)) : file.arrayBuffer()),
});

/** `open(url)`: a chosen file. */
export const openFile = (file: File): Promise<void> => useAppStore.getState().openFile(withSizeCheck(file));

/** A dropped file: as if chosen in the panel. */
export const openDroppedFile = (file: File): void => {
  chooseFile(() => void openFile(file));
};
