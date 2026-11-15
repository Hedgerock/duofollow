# Руководство разработчика DuoFollow

DuoFollow — неофициальное приложение на React и TypeScript для поиска невзаимных подписок Duolingo.

## Запуск локально

Понадобится Node.js 22. Из корня проекта:

```bash
npm ci
npm --prefix extension ci
npm --prefix extension run build
```

В `chrome://extensions` включи режим разработчика и загрузи распакованное расширение из `extension/dist`. Скопируй его
ID в корневой файл `.env.local`:

```dotenv
VITE_DUOFOLLOW_EXTENSION_ID=<ID установленного расширения>
```

Запусти `npm run dev -- --strictPort` и открой `http://localhost:5173/duofollow/`. Войди в Duolingo в том же профиле Chrome
и разреши доступ через окно настроек Connector. Затем укажи имя своего аккаунта. Если изменился `.env.local`, перезапусти Vite.
После правок расширения пересобери его и
нажми «Перезагрузить» в `chrome://extensions`.

Для проверки сайта из `dist` выполни `npm run build`, останови dev-сервер и запусти `npm run preview -- --port 5173 --strictPort`.
Открой `http://localhost:5173/duofollow/`. Порт 5173 входит в список разрешённых адресов коннектора.

## Разделы

- [Connector и маршруты API](connector.md) — разрешения, проверка сессии и адреса запросов.
- [Сравнение и интерфейс](comparison.md) — охват данных, список, отписка, вёрстка и локализация.
- [Проверки и выпуск](release.md) — тесты, ZIP для Chrome Web Store и GitHub Pages.
- [План развития](roadmap.md) — коды ошибок, профиль сессии, браузеры и языки.
- [CHANGELOG](../../CHANGELOG.md) — изменения для пользователей.
