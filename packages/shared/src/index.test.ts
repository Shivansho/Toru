import { describe, it, expect } from 'vitest';
import { getGreeting } from './index';

describe('shared core', () => {
  it('returns greeting', () => {
    expect(getGreeting()).toBe('Hello from shared!');
  });
});
