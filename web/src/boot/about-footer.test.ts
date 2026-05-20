// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';

import { mountAttributionsFooter } from './first-paint';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Story 2.7 AC4 — homepage footer "Attributions" link', () => {
  it('mounts a <footer class="v-app-footer"> in non-embed mode', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const result = mountAttributionsFooter(host, false, () => {});
    expect(result).not.toBeNull();
    const footer = host.querySelector('footer.v-app-footer');
    expect(footer).not.toBeNull();
  });

  it('renders a single anchor pointing at /about#attribution', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    mountAttributionsFooter(host, false, () => {});
    const link = host.querySelector('footer.v-app-footer a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/about#attribution');
    expect((link!.textContent ?? '').trim()).toBe('Attributions');
  });

  it('returns null AND does NOT mount the footer when embed mode is enabled (AC4)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const result = mountAttributionsFooter(host, true, () => {});
    expect(result).toBeNull();
    expect(host.querySelector('footer.v-app-footer')).toBeNull();
  });

  it('plain left-click invokes the navigate callback with /about#attribution', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const navigations: string[] = [];
    mountAttributionsFooter(host, false, (url) => navigations.push(url));
    const link = host.querySelector(
      'footer.v-app-footer a',
    ) as HTMLAnchorElement;
    const ev = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(ev);
    expect(navigations).toEqual(['/about#attribution']);
    // Click is intercepted (preventDefault).
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Ctrl/Cmd-click preserves the native open-in-new-tab semantics', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const navigations: string[] = [];
    mountAttributionsFooter(host, false, (url) => navigations.push(url));
    const link = host.querySelector(
      'footer.v-app-footer a',
    ) as HTMLAnchorElement;
    const ev = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    link.dispatchEvent(ev);
    expect(navigations).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Shift-click preserves native open-in-new-window semantics', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const navigations: string[] = [];
    mountAttributionsFooter(host, false, (url) => navigations.push(url));
    const link = host.querySelector(
      'footer.v-app-footer a',
    ) as HTMLAnchorElement;
    const ev = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
    });
    link.dispatchEvent(ev);
    expect(navigations).toEqual([]);
  });

  it('middle-click is NOT intercepted', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const navigations: string[] = [];
    mountAttributionsFooter(host, false, (url) => navigations.push(url));
    const link = host.querySelector(
      'footer.v-app-footer a',
    ) as HTMLAnchorElement;
    const ev = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    link.dispatchEvent(ev);
    expect(navigations).toEqual([]);
  });
});
