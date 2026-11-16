import { RelationshipLegend } from '@duofollow/src/following/RelationshipLegend';
import { BackToComparisonLink } from '@duofollow/src/pages/BackToComparisonLink';
import { SiteContent, SiteHeader } from '@duofollow/src/SiteLayout';
import { fontFamilies, fontSizes } from '@duofollow/src/useAppearance';
import { useSite } from '@duofollow/src/useSite';

const sizes = Object.keys(fontSizes) as (keyof typeof fontSizes)[];

export function SettingsPage() {
  const site = useSite();
  const { appearance, messages, updateAppearance } = site;
  const copy = messages.appearance;
  const formatScale = new Intl.NumberFormat(site.locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format;

  return (
    <>
      <SiteHeader site={site} />
      <SiteContent label={copy.title}>
        <main className="information-page">
          <section className="panel information-panel settings-panel">
            <h1>{copy.title}</h1>
            <div className="settings-fields">
              <label>
                <span>{copy.fontSize}</span>
                <select
                  value={appearance.fontSize}
                  onChange={(event) => {
                    const size = sizes.find((option) => option === event.target.value);
                    if (size) updateAppearance({ fontSize: size });
                  }}
                >
                  {sizes.map((size) => (
                    <option key={size} value={size}>
                      {formatScale(fontSizes[size])}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{copy.fontFamily}</span>
                <select
                  value={appearance.fontFamily}
                  onChange={(event) => {
                    const family = fontFamilies.find((option) => option === event.target.value);
                    if (family) updateAppearance({ fontFamily: family });
                  }}
                >
                  {fontFamilies.map((family) => (
                    <option key={family} value={family}>
                      {copy.families[family]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="settings-color-vision">
              <label>
                <input
                  type="checkbox"
                  checked={appearance.colorVision}
                  aria-describedby="color-vision-help"
                  onChange={(event) => updateAppearance({ colorVision: event.target.checked })}
                />
                {copy.colorVision}
              </label>
              <p id="color-vision-help">{copy.colorVisionHelp}</p>
              <RelationshipLegend
                relationships={['mutual', 'non-mutual', 'unknown']}
                messages={messages}
              />
            </div>
          </section>
          <div className="information-actions">
            <BackToComparisonLink label={messages.backToHome} />
          </div>
        </main>
      </SiteContent>
    </>
  );
}
