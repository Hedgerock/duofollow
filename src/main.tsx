import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { SiteRoutes } from '@duofollow/src/SiteRoutes';

import '@duofollow/src/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <SiteRoutes />
    </BrowserRouter>
  </React.StrictMode>,
);
