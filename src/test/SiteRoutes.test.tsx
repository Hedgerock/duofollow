import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteRoutes } from '@duofollow/src/SiteRoutes';
import viteConfig from '@duofollow/vite.config';

beforeEach(() => {
  vi.stubEnv('BASE_URL', viteConfig.base ?? '/');
  vi.stubGlobal('window', {
    localStorage: { getItem: () => null },
    navigator: { languages: ['en-US'] },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function render(path: string) {
  const base = import.meta.env.BASE_URL;
  return renderToStaticMarkup(
    <MemoryRouter basename={base} initialEntries={[`${base}${path.slice(1)}`]}>
      <SiteRoutes />
    </MemoryRouter>,
  );
}

describe('DuoFollow routes', () => {
  it.each([
    ['/privacy/', 'Privacy Policy'],
    ['/privacy/ru/', 'Политика конфиденциальности'],
    ['/privacy/uk/', 'Політика конфіденційності'],
  ])('renders %s in the shared layout without mounting the comparison', (path, heading) => {
    const html = render(path);
    expect(html).toContain('class="page"');
    expect(html).toContain('class="topbar"');
    expect(html).toContain('src="/duofollow/duofollow.svg"');
    expect(html).toMatch(/class="brand site-home-link" href="\/duofollow\/"/);
    expect(html).toContain(`<h1>${heading}</h1>`);
    expect(html).toContain('mailto:devdmitrovasyliev@gmail.com');
    expect(html).toContain('href="/duofollow/access/"');
    expect(html).not.toContain('duolingo-username');
  });

  it('renders the access instructions with a link back to the public policy', () => {
    const html = render('/access/');
    expect(html).toContain('<h1>Duolingo access</h1>');
    expect(html).toContain('Open settings');
    expect(html).toContain('Back to comparison');
    expect(html).toContain('class="secondary-button information-button" href="/duofollow/"');
    expect(html).toContain(
      'class="secondary-button information-button" href="/duofollow/privacy/"',
    );
    expect(html).not.toContain('duolingo-username');
  });
});
