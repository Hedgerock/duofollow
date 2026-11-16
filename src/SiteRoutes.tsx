import { Navigate, Route, Routes } from 'react-router';

import App from '@duofollow/src/App';
import { AccessPage } from '@duofollow/src/pages/AccessPage';
import { PrivacyPage } from '@duofollow/src/pages/PrivacyPage';
import { SettingsPage } from '@duofollow/src/pages/SettingsPage';
import { SiteContent, SiteHeader, SiteLayout } from '@duofollow/src/SiteLayout';
import { useSite } from '@duofollow/src/useSite';

function NotFoundPage() {
  const site = useSite();
  return (
    <>
      <SiteHeader site={site} />
      <SiteContent label={site.messages.pageNotFound}>
        <main className="information-page">
          <div className="panel information-panel">
            <h1>{site.messages.pageNotFound}</h1>
          </div>
        </main>
      </SiteContent>
    </>
  );
}

export function SiteRoutes() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<App />} />
        <Route path="index.html" element={<Navigate to="/" replace />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="privacy/ru" element={<PrivacyPage />} />
        <Route path="privacy/uk" element={<PrivacyPage />} />
        <Route path="privacy/index.html" element={<Navigate to="/privacy/" replace />} />
        <Route path="privacy/ru/index.html" element={<Navigate to="/privacy/ru/" replace />} />
        <Route path="privacy/uk/index.html" element={<Navigate to="/privacy/uk/" replace />} />
        <Route path="access" element={<AccessPage />} />
        <Route path="access/index.html" element={<Navigate to="/access/" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/index.html" element={<Navigate to="/settings/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
