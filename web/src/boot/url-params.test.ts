import { describe, it, expect } from 'vitest';
import { getUrlParams } from './url-params';

describe('getUrlParams', () => {
  it('returns defaults for empty string', () => {
    const p = getUrlParams('');
    expect(p.forceLogDepth).toBe(false);
    expect(p.devMode).toBe(null);
  });

  it('parses ?force-log-depth=1 as true', () => {
    expect(getUrlParams('?force-log-depth=1').forceLogDepth).toBe(true);
  });

  it('parses ?force-log-depth=true as true', () => {
    expect(getUrlParams('?force-log-depth=true').forceLogDepth).toBe(true);
  });

  it('treats ?force-log-depth (no value) as true', () => {
    expect(getUrlParams('?force-log-depth=').forceLogDepth).toBe(true);
  });

  it('treats ?force-log-depth=0 as false', () => {
    expect(getUrlParams('?force-log-depth=0').forceLogDepth).toBe(false);
  });

  it('parses ?dev=precision', () => {
    const p = getUrlParams('?dev=precision');
    expect(p.devMode).toBe('precision');
    expect(p.forceLogDepth).toBe(false);
  });

  it('parses combined ?dev=precision&force-log-depth=1', () => {
    const p = getUrlParams('?dev=precision&force-log-depth=1');
    expect(p.devMode).toBe('precision');
    expect(p.forceLogDepth).toBe(true);
  });

  it('ignores unrelated query parameters', () => {
    const p = getUrlParams('?utm_source=test&foo=bar');
    expect(p.forceLogDepth).toBe(false);
    expect(p.devMode).toBe(null);
  });

  it('returns defaults when search is undefined and location is unavailable', () => {
    // In a test environment without a DOM, location may be undefined.
    // jsdom provides one in vitest by default, so verify with an explicit
    // empty-string fallback by going through the API (no args).
    const p = getUrlParams();
    // Either jsdom's empty location.search ("") or the undefined branch
    // must return safe defaults.
    expect(p.forceLogDepth).toBe(false);
    expect(p.devMode).toBe(null);
  });
});
