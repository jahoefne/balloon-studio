// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stage, type StageProps } from './Stage';

const props: StageProps = {
  mesh: null,
  geometryKey: '0:a',
  color: [0.86, 0.43, 0.18],
  showPlate: true,
  wireframe: false,
  resetCamera: 0,
  cutaway: false,
  inspectOpening: false,
  neckDiameter: 32,
};

describe('Stage', () => {
  it('without WebGL: shows the fallback text and keeps its label', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Stage {...props} objectName="cloud lamp" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Interactive cloud lamp preview. Drag to rotate, scroll to zoom.');
    expect(screen.getByText(/needs WebGL/)).toBeTruthy();
    vi.restoreAllMocks();
  });
});
