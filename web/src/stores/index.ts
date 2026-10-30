// The app's stores. Importing this reads saved settings from localStorage; the workers
// start with the first preview or file.

import { core } from '#core/parameters';
import { settingsStorage, setQuotaExceededHandler, STORAGE_FULL_MESSAGE } from '../persistence/settingsStorage';
import { commitEditing } from '../ui/commitEditing';
import { lazyWorkerClient } from './deps';
import { createStudio } from './studio';

export const previewClient = lazyWorkerClient('preview');
/** Export, STL import and lamp settings run here (WP-U9). */
export const ioClient = lazyWorkerClient('io');

const studio = createStudio({ core, previewClient, ioClient, settings: settingsStorage, commitEditing: () => commitEditing() });

setQuotaExceededHandler(() => studio.app.getState().setStorageWarning(STORAGE_FULL_MESSAGE));

export const useBalloonStore = studio.balloon;
export const useBasketStore = studio.basket;
export const useRingStore = studio.ring;
export const useCloudStore = studio.cloud;
export const useSunStore = studio.sun;
export const useFigureStore = studio.figure;
export const useClipStore = studio.clip;
export const useImportStore = studio.importer;
export const useAppStore = studio.app;

export { STUDIO_PARTS, type AppState, type BalloonViewToggles } from './appStore';
export type { ExportedFile, PartState } from './createPartStore';
export type { OpenableFile, StlReview } from './importStore';
