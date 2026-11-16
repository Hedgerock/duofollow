import english from '@duofollow/privacy/index.html?raw';
import russian from '@duofollow/privacy/ru/index.html?raw';
import ukrainian from '@duofollow/privacy/uk/index.html?raw';
import { BackToComparisonLink } from '@duofollow/src/pages/BackToComparisonLink';
import { SiteContent, SiteHeader } from '@duofollow/src/SiteLayout';
import { useSite } from '@duofollow/src/useSite';

function policyBody(html: string): string {
  const match = /<main>([\s\S]*?)<\/main>/.exec(html);
  if (!match) throw new Error('The privacy page must contain a main element');
  return match[1];
}

// The checked-in HTML keeps the same policy readable before React loads.
const policy = { en: policyBody(english), ru: policyBody(russian), uk: policyBody(ukrainian) };

export function PrivacyPage() {
  const site = useSite();
  return (
    <>
      <SiteHeader site={site} />
      <SiteContent label={site.messages.privacy}>
        <main className="information-page">
          <article
            className="panel information-panel"
            dangerouslySetInnerHTML={{ __html: policy[site.locale] }}
          />
          <div className="information-actions">
            <BackToComparisonLink label={site.messages.backToHome} />
          </div>
        </main>
      </SiteContent>
    </>
  );
}
