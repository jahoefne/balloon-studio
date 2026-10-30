// StudioImportModel (STLImportView.swift:13-69): reads a chosen or dropped file in the io
// worker and either holds a balloon for review or hands lamp settings to the caller. The
// panels are the UI's (WP-U5); `chooseFile` is what the Mac does before showing one.

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { toCoreError } from '../core/api';
import type { CloudParameters, ImportedBalloon } from '../core/types';
import type { StoreDeps } from './deps';

/** A browser `File` has all of this. */
export type OpenableFile = Pick<File, 'name' | 'text' | 'arrayBuffer'>;

export interface StlReview {
  /** `url.lastPathComponent` */
  name: string;
  imported: ImportedBalloon;
}

export interface ImportState {
  loading: boolean;
  review: StlReview | null;
  error: string | null;
  /** Guards and commits; true when the open panel may show. */
  chooseFile(): boolean;
  open(file: OpenableFile, useSettings: (parameters: CloudParameters) => void): Promise<void>;
  setReview(review: StlReview | null): void;
  setError(error: string | null): void;
}

export type ImportStore = UseBoundStore<StoreApi<ImportState>>;

/** `URL.pathExtension`, lowercased: a leading dot is a hidden file's name, not an extension. */
const pathExtension = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export const createImportStore = (deps: Pick<StoreDeps, 'ioClient' | 'commitEditing'>): ImportStore =>
  create<ImportState>()((set, get) => ({
    loading: false,
    review: null,
    error: null,
    chooseFile() {
      const { loading, review } = get();
      if (loading || review !== null) return false;
      deps.commitEditing();
      return true;
    },
    async open(file, useSettings) {
      const { loading, review } = get();
      if (loading || review !== null) return;
      const fileExtension = pathExtension(file.name);
      if (fileExtension !== 'stl' && fileExtension !== 'json') {
        set({ error: 'Choose a balloon STL or a cloud or sun settings JSON file.' });
        return;
      }
      set({ error: null, loading: true });
      try {
        if (fileExtension === 'json') {
          useSettings(await deps.ioClient.decodeLampSettings(await file.text()));
        } else {
          const imported = await deps.ioClient.importSTL(new Uint8Array(await file.arrayBuffer()));
          set({ review: { name: file.name, imported } });
        }
      } catch (error) {
        set({ error: toCoreError(error).message });
      }
      set({ loading: false });
    },
    setReview: (review) => set({ review }),
    setError: (error) => set({ error }),
  }));
