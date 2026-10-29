// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell (M0 placeholder)', () => {
  it('renders the title and subtitle', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Balloon Studio' })).toBeTruthy();
    expect(screen.getByText('A little shape. A lot of possibility.')).toBeTruthy();
  });
});
