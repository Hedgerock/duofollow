import { Navigate, Route, Routes } from 'react-router';
import App from './App';
import { AccessPage } from './pages/AccessPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { SiteContent, SiteHeader, SiteLayout } from './SiteLayout';
import { useSite } from './useSite';

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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
