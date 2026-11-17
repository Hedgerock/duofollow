# Changelog

## Unreleased

### Added

- Quick unfollow lets the website dialog confirm a single unfollow. The standard flow asks for additional confirmation in the extension.

- Comparison results show how many follows and followers were checked.
- Switch between all received, mutual, and non-mutual follows. The all-received view highlights mutual follows and labels unconfirmed profiles when the followers list is incomplete.
- Follows can be sorted by name in either direction or shown in the order received.
- Browser integration tests and screenshot comparisons can run in Docker Compose.
- Pull requests run the browser integration and Linux screenshot checks.
- The home page provides Open Graph metadata and a 1200 × 630 image for link previews.
- Settings let visitors change text size and typeface and distinguish follow statuses by solid, dashed, and dotted markers.
- A Chromium load test tracks retained JS heap, DOM nodes, and event listeners on a virtual list of 10,000 profiles.

### Changed

- Unfollows require final confirmation in the Connector window. After a lost response, the Connector checks the follow again using a read-only request and keeps the profile in the list when the outcome remains unknown.

- The **Partial** label opens and closes its explanation without resizing neighboring cards.

- Browser tabs share Duolingo session checks and pause them after HTTP 429.
- The site loads avatars from approved hosts and shows initials for other URLs.

- The header and footer stay in place while the main content scrolls. The scrollbar follows the site theme.
- Small screens place the sort control beside search and explain an unavailable non-mutual filter next to the view buttons.
- The list header highlights the selected view’s count and shows matches out of that total during search.
- Relationship markers now show a tooltip from the pointer or keyboard and keep profile rows free of status text.
- The page keeps a minimum width of 320 CSS px. Dialogs and notifications fit the visible viewport.
- The developer guide links to separate pages for the Connector, comparison, release checks, and roadmap.

### Fixed

- Returning to comparison from a directly opened privacy page restores the Connector connection.

- A malformed comparison reply shows an error and preserves the previous results.

- Connector messages distinguish expired sessions, rate limits, timeouts, and unexpected replies.

- Profile names and usernames use separate text directions. Search matches canonically equivalent Unicode names.
- Long usernames, translated list headings, and Connector buttons fit at 125% text size.
- Returning from the privacy policy or access page rechecks a failed Connector status before showing a warning.
