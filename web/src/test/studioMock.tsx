// For the shell and editor tests. Stands in for `web/src/stores` (real stores on a fake preview
// client, storage and io client; only `commitEditing` is the real blur) and for
// `web/src/preview/Stage`, which needs WebGL and records its props instead:
//
//   vi.mock('../stores', () => import('../test/studioMock'));
//   vi.mock('../preview/Stage', () => import('../test/studioMock'));

import type { StageProps } from '../preview/controller';
import { createStudio } from '../stores/studio';
import { testDeps } from '../stores/testKit';
import { commitEditing } from '../ui/commitEditing';

export { STUDIO_PARTS } from '../stores/appStore';

export const testKit = testDeps();
const studio = createStudio({ ...testKit.deps, commitEditing: () => commitEditing() });

export const previewClient = testKit.deps.previewClient;
export const ioClient = testKit.deps.ioClient;
export const useBalloonStore = studio.balloon;
export const useBasketStore = studio.basket;
export const useRingStore = studio.ring;
export const useCloudStore = studio.cloud;
export const useSunStore = studio.sun;
export const useFigureStore = studio.figure;
export const useClipStore = studio.clip;
export const useImportStore = studio.importer;
export const useAppStore = studio.app;

let stageProps: StageProps[] = [];

export function Stage(props: StageProps) {
  stageProps.push(props);
  return <div data-testid="stage" />;
}

/** The props of the last Stage rendered. */
export const lastStageProps = (): StageProps => {
  const props = stageProps.at(-1);
  if (!props) throw new Error('No Stage has rendered');
  return props;
};

/** Puts every store back to where it started; call before each test. */
export const resetStudio = (): void => {
  stageProps = [];
  testKit.preview.calls.length = 0;
  const stores = [useBalloonStore, useBasketStore, useRingStore, useCloudStore, useSunStore, useFigureStore, useClipStore, useImportStore, useAppStore] as { setState(state: unknown, replace: true): void; getInitialState(): unknown }[];
  for (const store of stores) store.setState(store.getInitialState(), true);
};
