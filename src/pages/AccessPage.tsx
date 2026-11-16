import { useState } from 'react';
import { Link } from 'react-router';

import english from '@duofollow/extension/_locales/en/messages.json';
import russian from '@duofollow/extension/_locales/ru/messages.json';
import ukrainian from '@duofollow/extension/_locales/uk/messages.json';
import { privacyPath } from '@duofollow/extension/src/locales';
import { DuoFollowConnector } from '@duofollow/src/api/extension/DuoFollowConnector';
import { BackToComparisonLink } from '@duofollow/src/pages/BackToComparisonLink';
import { SiteContent, SiteHeader } from '@duofollow/src/SiteLayout';
import { useSite } from '@duofollow/src/useSite';

const access = { en: english, ru: russian, uk: ukrainian };
const connector = new DuoFollowConnector(import.meta.env.VITE_DUOFOLLOW_EXTENSION_ID);

export function AccessPage() {
  const site = useSite();
  const copy = access[site.locale];
  const [state, setState] = useState<'opening' | 'error' | 'idle'>('idle');

  async function openSettings() {
    setState('opening');
    try {
      await connector.openDuolingoSettings();
      setState('idle');
    } catch {
      setState('error');
    }
  }

  return (
    <>
      <SiteHeader site={site} />
      <SiteContent label={copy.accessTitle.message}>
        <main className="information-page">
          <article className="panel information-panel">
            <h1>{copy.accessTitle.message}</h1>
            <p>{copy.accessSession.message}</p>
            <p>{copy.accessData.message}</p>
            <p>{copy.accessRecurring.message}</p>
            <p>{site.messages.accessHelp(copy.accessGrant.message, copy.accessRevoke.message)}</p>
            <div className="information-actions">
              <button
                className="primary-button"
                type="button"
                disabled={state === 'opening'}
                onClick={() => void openSettings()}
              >
                {site.messages.connection.openSettings}
              </button>
              <Link
                className="secondary-button information-button"
                to={`/${privacyPath(site.locale)}`}
              >
                {site.messages.privacy}
              </Link>
              <BackToComparisonLink label={site.messages.backToHome} />
            </div>
            {state === 'error' && (
              <p role="alert">
                <strong>{site.messages.notifications.settingsError}.</strong>{' '}
                {site.messages.notifications.settingsHint}
              </p>
            )}
          </article>
        </main>
      </SiteContent>
    </>
  );
}
