import type { ConnectorStatus } from '../../extension/src/dto/ConnectorSession';
import type { Locale } from '../../extension/src/locales';

type ConnectionIssue = Exclude<ConnectorStatus, 'ready'>;

const ru = {
  language: 'Язык',
  subtitle: 'Управление подписками',
  privacy: 'Конфиденциальность',
  independent: 'Неофициальный проект. Не связан с Duolingo.',
  resultFor: 'Результат для',
  resultProfile: (name: string) =>
    `Результат для @${name}. Открыть профиль в Duolingo в новой вкладке`,
  manageAccess: 'Управлять доступом к Duolingo',
  backToHome: 'К сравнению',
  accessHelp: (grant: string, revoke: string) =>
    `В настройках Connector можно нажать «${grant}» или «${revoke}». Chrome подтверждает выдачу разрешений в отдельном окне.`,
  pageNotFound: 'Страница не найдена',
  lightTheme: 'Включить светлую тему',
  darkTheme: 'Включить тёмную тему',
  heading: 'Подписки Duolingo',
  intro: 'Сравни подписки и подписчиков, чтобы найти невзаимные.',
  accountLabel: 'Имя аккаунта, открытого в Duolingo',
  username: 'Имя пользователя',
  compare: 'Сравнить мои подписки',
  comparing: 'Сравниваем…',
  resultsLabel: 'Результат проверки подписок',
  checked: 'Подписки проверены',
  mutual: 'Взаимные',
  nonMutual: 'Невзаимные',
  amongChecked: 'среди проверенных',
  incomplete: 'Список подписчиков неполный',
  ofTotal: (total: string) => `из ${total}`,
  nonMutualTitle: 'Невзаимные подписки Duolingo',
  listLabel: 'Невзаимные подписки',
  searchLabel: 'Поиск по невзаимным подпискам',
  searchPlaceholder: 'Имя или @username',
  noMatches: 'По этому запросу никого не найдено.',
  noNonMutual: 'Среди проверенных подписок невзаимных нет.',
  checkedCount: (checked: string, total: string) => `Проверено ${checked} из ${total} подписок.`,
  user: 'Пользователь',
  openProfile: (name: string) => `Открыть профиль ${name} в новой вкладке`,
  unfollowProfile: (name: string) => `Отписаться от ${name}`,
  unfollowingProfile: (name: string) => `Отписываемся от ${name}`,
  unfollow: 'Отписаться',
  unfollowing: 'Отписываемся…',
  unfollowTitle: 'Отписаться от пользователя?',
  unfollowDescription: ['Подписка с аккаунта ', ' будет удалена.'],
  cancel: 'Отмена',
  close: 'Закрыть',
  connection: {
    checking: 'Проверяем подключение к Duolingo…',
    help: 'Как подключиться',
    description: 'Сравнение и отписка доступны после подключения.',
    retry: 'Проверить снова',
    retrying: 'Проверяем…',
    stillUnavailable: 'Подключение пока не восстановлено.',
    openSettings: 'Открыть настройки',
    installHelp: 'Как установить из проекта',
    install:
      'На странице chrome://extensions включи режим разработчика и загрузи папку extension/dist через «Загрузить распакованное расширение». После установки обнови DuoFollow.',
    openDuolingo: 'Открыть Duolingo',
    issues: {
      'connector-unavailable': {
        title: 'DuoFollow Connector недоступен',
        steps: [
          'Открой chrome://extensions и включи DuoFollow Connector.',
          'Вернись в DuoFollow и нажми «Проверить снова».',
        ],
      },
      'connector-outdated': {
        title: 'Обнови DuoFollow Connector',
        steps: [
          'Установи последнюю версию Connector.',
          'Перезагрузи расширение на странице chrome://extensions и нажми «Проверить снова».',
        ],
      },
      'consent-required': {
        title: 'Подключи Duolingo',
        steps: [
          'Открой настройки Connector и прочитай, какие данные он использует.',
          'Нажми кнопку выдачи доступа, подтверди запрос Chrome и вернись на эту вкладку.',
        ],
      },
      'signed-out': {
        title: 'Войди в Duolingo',
        steps: [
          'Войди в Duolingo в том же профиле Chrome.',
          'Вернись в DuoFollow и нажми «Проверить снова».',
        ],
      },
      'duolingo-unavailable': {
        title: 'Не удалось проверить сессию Duolingo',
        steps: [
          'Убедись, что Duolingo доступен и вход выполнен.',
          'Вернись в DuoFollow и нажми «Проверить снова».',
        ],
      },
    } satisfies Record<ConnectionIssue, { title: string; steps: string[] }>,
  },
  notifications: {
    label: 'Уведомления',
    close: (title: string) => `Закрыть уведомление «${title}»`,
    settingsError: 'Не удалось открыть настройки',
    settingsHint: 'Выбери DuoFollow Connector в меню расширений Chrome.',
    comparing: 'Сравниваем подписки',
    loadingAccount: (name: string) => `Загружаем данные для ${name}.`,
    complete: 'Сравнение завершено',
    compareError: 'Не удалось сравнить подписки',
    checkAccount: 'Проверь подключение и имя аккаунта, открытого в Duolingo.',
    unfollowDone: 'Подписка удалена',
    unfollowError: 'Не удалось подтвердить отписку',
    retryUnfollow: 'Сравни подписки перед повторной попыткой.',
  },
};

export type Messages = typeof ru;

const en = {
  language: 'Language',
  subtitle: 'Subscription Manager',
  privacy: 'Privacy Policy',
  independent: 'An independent project. Not affiliated with Duolingo.',
  resultFor: 'Results for',
  resultProfile: (name: string) => `Results for @${name}. Open the Duolingo profile in a new tab`,
  manageAccess: 'Manage Duolingo access',
  backToHome: 'Back to comparison',
  accessHelp: (grant: string, revoke: string) =>
    `In the Connector settings, select “${grant}” or “${revoke}”. Chrome asks you to confirm new permissions in a separate dialog.`,
  pageNotFound: 'Page not found',
  lightTheme: 'Switch to light theme',
  darkTheme: 'Switch to dark theme',
  heading: 'Duolingo follows',
  intro: 'Compare who you follow with your followers to see who doesn’t follow you back.',
  accountLabel: 'Username of the account signed in to Duolingo',
  username: 'Username',
  compare: 'Compare my follows',
  comparing: 'Comparing…',
  resultsLabel: 'Follow comparison results',
  checked: 'Follows checked',
  mutual: 'Mutual',
  nonMutual: 'Non-mutual',
  amongChecked: 'among checked follows',
  incomplete: 'The followers list is incomplete',
  ofTotal: (total: string) => `of ${total}`,
  nonMutualTitle: 'People who don’t follow you back',
  listLabel: 'Non-mutual follows',
  searchLabel: 'Search non-mutual follows',
  searchPlaceholder: 'Name or @username',
  noMatches: 'No profiles match your search.',
  noNonMutual: 'Everyone checked follows you back.',
  checkedCount: (checked: string, total: string) => `Checked ${checked} of ${total} follows.`,
  user: 'User',
  openProfile: (name: string) => `Open ${name}’s profile in a new tab`,
  unfollowProfile: (name: string) => `Unfollow ${name}`,
  unfollowingProfile: (name: string) => `Unfollowing ${name}`,
  unfollow: 'Unfollow',
  unfollowing: 'Unfollowing…',
  unfollowTitle: 'Unfollow this user?',
  unfollowDescription: ['', ' will stop following this user.'],
  cancel: 'Cancel',
  close: 'Close',
  connection: {
    checking: 'Checking the Duolingo connection…',
    help: 'How to connect',
    description: 'Connect to compare follows and unfollow profiles.',
    retry: 'Check again',
    retrying: 'Checking…',
    stillUnavailable: 'Still unable to connect.',
    openSettings: 'Open settings',
    installHelp: 'Install from the project',
    install:
      'Open chrome://extensions, turn on Developer mode, and use Load unpacked to select extension/dist. Then refresh DuoFollow.',
    openDuolingo: 'Open Duolingo',
    issues: {
      'connector-unavailable': {
        title: 'DuoFollow Connector is unavailable',
        steps: [
          'Open chrome://extensions and enable DuoFollow Connector.',
          'Return to DuoFollow and select “Check again”.',
        ],
      },
      'connector-outdated': {
        title: 'Update DuoFollow Connector',
        steps: [
          'Install the latest version of the Connector.',
          'Reload the extension at chrome://extensions, then select “Check again”.',
        ],
      },
      'consent-required': {
        title: 'Connect Duolingo',
        steps: [
          'Open the Connector settings and review what data it uses.',
          'Select the button to grant access, confirm the Chrome prompt, and return to this tab.',
        ],
      },
      'signed-out': {
        title: 'Sign in to Duolingo',
        steps: [
          'Sign in to Duolingo in the same Chrome profile.',
          'Return to DuoFollow and select “Check again”.',
        ],
      },
      'duolingo-unavailable': {
        title: 'Could not check your Duolingo session',
        steps: [
          'Check that Duolingo is reachable and that you are signed in.',
          'Return to DuoFollow and select “Check again”.',
        ],
      },
    },
  },
  notifications: {
    label: 'Notifications',
    close: (title: string) => `Dismiss notification “${title}”`,
    settingsError: 'Could not open settings',
    settingsHint: 'Select DuoFollow Connector from the Chrome extensions menu.',
    comparing: 'Comparing follows',
    loadingAccount: (name: string) => `Loading data for ${name}.`,
    complete: 'Comparison complete',
    compareError: 'Could not compare follows',
    checkAccount: 'Check your connection and the username signed in to Duolingo.',
    unfollowDone: 'Unfollowed',
    unfollowError: 'Could not confirm the unfollow',
    retryUnfollow: 'Compare your follows before trying again.',
  },
} satisfies Messages;

const uk = {
  language: 'Мова',
  subtitle: 'Керування підписками',
  privacy: 'Політика конфіденційності',
  independent: 'Незалежний проєкт, який не пов’язаний із Duolingo.',
  resultFor: 'Результат для',
  resultProfile: (name: string) =>
    `Результат для @${name}. Відкрити профіль у Duolingo в новій вкладці`,
  manageAccess: 'Керувати доступом до Duolingo',
  backToHome: 'До порівняння',
  accessHelp: (grant: string, revoke: string) =>
    `У налаштуваннях Connector вибери «${grant}» або «${revoke}». Chrome просить підтвердити нові дозволи в окремому вікні.`,
  pageNotFound: 'Сторінку не знайдено',
  lightTheme: 'Увімкнути світлу тему',
  darkTheme: 'Увімкнути темну тему',
  heading: 'Підписки Duolingo',
  intro: 'Порівняй свої підписки й підписників, щоб знайти невзаємні підписки.',
  accountLabel: 'Ім’я акаунта, у який виконано вхід у Duolingo',
  username: 'Ім’я користувача',
  compare: 'Порівняти мої підписки',
  comparing: 'Порівнюємо…',
  resultsLabel: 'Результат перевірки підписок',
  checked: 'Підписки перевірено',
  mutual: 'Взаємні',
  nonMutual: 'Невзаємні',
  amongChecked: 'серед перевірених',
  incomplete: 'Список підписників неповний',
  ofTotal: (total: string) => `з ${total}`,
  nonMutualTitle: 'Невзаємні підписки Duolingo',
  listLabel: 'Невзаємні підписки',
  searchLabel: 'Пошук серед невзаємних підписок',
  searchPlaceholder: 'Ім’я або @username',
  noMatches: 'За цим запитом нікого не знайдено.',
  noNonMutual: 'Серед перевірених підписок немає невзаємних.',
  checkedCount: (checked: string, total: string) => `Перевірено ${checked} з ${total} підписок.`,
  user: 'Користувач',
  openProfile: (name: string) => `Відкрити профіль ${name} в новій вкладці`,
  unfollowProfile: (name: string) => `Відписатися від ${name}`,
  unfollowingProfile: (name: string) => `Відписуємося від ${name}`,
  unfollow: 'Відписатися',
  unfollowing: 'Відписуємося…',
  unfollowTitle: 'Відписатися від цього користувача?',
  unfollowDescription: ['Підписку з акаунта ', ' буде видалено.'],
  cancel: 'Скасувати',
  close: 'Закрити',
  connection: {
    checking: 'Перевіряємо підключення до Duolingo…',
    help: 'Як підключитися',
    description: 'Порівняння та відписка доступні після підключення.',
    retry: 'Перевірити знову',
    retrying: 'Перевіряємо…',
    stillUnavailable: 'Підключення ще не відновлено.',
    openSettings: 'Відкрити налаштування',
    installHelp: 'Як встановити з проєкту',
    install:
      'Відкрий chrome://extensions, увімкни режим розробника та завантаж папку extension/dist як розпаковане розширення. Після встановлення онови DuoFollow.',
    openDuolingo: 'Відкрити Duolingo',
    issues: {
      'connector-unavailable': {
        title: 'DuoFollow Connector недоступний',
        steps: [
          'Відкрий chrome://extensions і ввімкни DuoFollow Connector.',
          'Повернися в DuoFollow й натисни «Перевірити знову».',
        ],
      },
      'connector-outdated': {
        title: 'Онови DuoFollow Connector',
        steps: [
          'Установи останню версію Connector.',
          'Перезавантаж розширення на сторінці chrome://extensions і натисни «Перевірити знову».',
        ],
      },
      'consent-required': {
        title: 'Підключи Duolingo',
        steps: [
          'Відкрий налаштування Connector і прочитай, які дані він використовує.',
          'Натисни кнопку надання доступу, підтвердь запит Chrome і повернися до цієї вкладки.',
        ],
      },
      'signed-out': {
        title: 'Увійди в Duolingo',
        steps: [
          'Увійди в Duolingo в тому самому профілі Chrome.',
          'Повернися в DuoFollow й натисни «Перевірити знову».',
        ],
      },
      'duolingo-unavailable': {
        title: 'Не вдалося перевірити сеанс Duolingo',
        steps: [
          'Переконайся, що Duolingo доступний і ти ввійшов в акаунт.',
          'Повернися в DuoFollow й натисни «Перевірити знову».',
        ],
      },
    },
  },
  notifications: {
    label: 'Сповіщення',
    close: (title: string) => `Закрити сповіщення «${title}»`,
    settingsError: 'Не вдалося відкрити налаштування',
    settingsHint: 'Вибери DuoFollow Connector у меню розширень Chrome.',
    comparing: 'Порівнюємо підписки',
    loadingAccount: (name: string) => `Завантажуємо дані для ${name}.`,
    complete: 'Порівняння завершено',
    compareError: 'Не вдалося порівняти підписки',
    checkAccount: 'Перевір підключення й ім’я акаунта, у який виконано вхід у Duolingo.',
    unfollowDone: 'Підписку видалено',
    unfollowError: 'Не вдалося підтвердити відписку',
    retryUnfollow: 'Порівняй підписки перед повторною спробою.',
  },
} satisfies Messages;

export const translations: Record<Locale, Messages> = { ru, en, uk };

export function localizedError(locale: Locale, details: string, fallback = ''): string {
  if (locale === 'ru') return details || fallback;
  return [details.match(/\bHTTP [1-5]\d{2}\b/)?.[0], fallback].filter(Boolean).join(' · ');
}
