import { afterEach, describe, expect, it, vi } from 'vitest';

import { getConnectorExtensionId } from '@duofollow/src/api/extension/connectorConfig';
import { getBrowserInfo } from '@duofollow/src/browser';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('browser-specific Connector configuration', () => {
  it('recognizes Edge client hints even when its user agent includes Chrome', () => {
    expect(
      getBrowserInfo({
        userAgent: 'Chrome/157.0.0.0',
        userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }] },
      }),
    ).toEqual({ id: 'edge', name: 'Microsoft Edge', extensionsUrl: 'edge://extensions' });
  });

  it('uses the desktop Edge token when client hints are absent', () => {
    expect(getBrowserInfo({ userAgent: 'Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0' }).id).toBe(
      'edge',
    );
    expect(getBrowserInfo({ userAgent: 'Chrome/157.0.0.0 Safari/537.36' }).id).toBe('chrome');
    expect(getBrowserInfo({}).extensionsUrl).toBe('chrome://extensions');
  });

  it.each([
    ['Chrome/157.0', 'chrome-id', 'edge-id', 'chrome-id'],
    ['Chrome/157.0 Edg/157.0', 'chrome-id', ' edge-id ', 'edge-id'],
    ['Chrome/157.0 Edg/157.0', ' chrome-id ', '', 'chrome-id'],
    ['Chrome/157.0 Edg/157.0', 'chrome-id', '   ', 'chrome-id'],
    ['Chrome/157.0 Edg/157.0', '', 'edge-id', 'edge-id'],
    ['Chrome/157.0', '', 'edge-id', ''],
  ])('selects the installed ID for %s (%s / %s)', (userAgent, defaultId, edgeId, expected) => {
    vi.stubGlobal('navigator', { userAgent });
    vi.stubEnv('VITE_DUOFOLLOW_EXTENSION_ID', defaultId);
    vi.stubEnv('VITE_DUOFOLLOW_EDGE_EXTENSION_ID', edgeId);
    expect(getConnectorExtensionId()).toBe(expected);
  });

  it.each(['en', 'ru', 'uk'] as const)(
    'uses Edge instructions throughout the %s UI',
    async (locale) => {
      vi.stubGlobal('navigator', { userAgent: 'Chrome/157.0 Edg/157.0' });
      const { translations } = await import('@duofollow/src/i18n/messages');
      const text = translations[locale];
      expect(text.connection.install).toContain('edge://extensions');
      expect(text.connection.issues['connector-unavailable'].steps[0]).toContain(
        'edge://extensions',
      );
      expect(text.connection.issues['connector-outdated'].steps[1]).toContain('edge://extensions');
      expect(text.connectorErrors.SIGNED_OUT).toContain('Microsoft Edge');
      expect(text.accessHelp('grant', 'revoke')).toContain('Microsoft Edge');
      expect(text.notifications.settingsHint).toContain('Microsoft Edge');
      expect(JSON.stringify(text)).not.toContain('chrome://extensions');
    },
  );
});
