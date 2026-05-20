// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { debounce } from './debounce';

describe('Story 1.11 Task 11 — debounce(fn, ms)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not invoke fn synchronously on call (trailing-only)', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d();
    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes fn once after ms elapses', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid calls into one trailing call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d();
    vi.advanceTimersByTime(100);
    d();
    vi.advanceTimersByTime(100);
    d();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the LAST set of arguments to the trailing call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d('a');
    d('b');
    d('c');
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledWith('c');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel() clears the pending trailing call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel() is idempotent (multiple calls do not throw)', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d();
    d.cancel();
    expect(() => d.cancel()).not.toThrow();
  });

  it('can be re-invoked after the trailing call fires', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d('first');
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenLastCalledWith('first');
    d('second');
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenLastCalledWith('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('handles multi-argument signatures', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1, 2, 3);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith(1, 2, 3);
  });
});
