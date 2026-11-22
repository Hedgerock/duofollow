# Changelog

## Unreleased

### Added

- Settings can turn website tooltips off and on. The choice is saved with appearance preferences and supports English, Russian, and Ukrainian.

- Desktop Microsoft Edge uses the same extension build, an optional separate extension ID, browser-specific connection instructions, and a Windows UI integration job. The maintainer reported successful automated and manual checks.

- DuoFollow detects the signed-in Duolingo account after access is granted and starts a comparison. The connected account card shows a skeleton during comparison. It provides a refresh action, and manual entry remains available if profile detection fails.
- The extension settings and confirmation window support a saved choice of English, Russian, or Ukrainian.
- Search briefly highlights the matching characters in a profile name or username. The results area keeps its height while filtering.

- Quick unfollow lets the website dialog confirm a single unfollow. The standard flow asks for additional confirmation in the extension.

- Comparison results show how many follows and followers were checked.
- Switch between all received, mutual, and non-mutual follows. The all-received view highlights mutual follows and labels unconfirmed profiles when the followers list is incomplete.
- Follows can be sorted by name in either direction or shown in the order received.
- Browser integration tests and screenshot comparisons can run in Docker Compose.
- Pull requests run Vitest, ESLint, Prettier, browser integration tests, and Linux screenshot checks.
- The home page provides Open Graph metadata and a 1200 × 630 image for link previews.
- Settings let visitors change text size and typeface and distinguish follow statuses by solid, dashed, and dotted markers.
- A Chromium load test tracks retained JS heap, DOM nodes, and event listeners on a virtual list of 10,000 profiles.

### Changed

- Follow status markers use a normal cursor when tooltips are disabled and restore the help cursor when enabled. Tooltips remain enabled by default for new visitors.

- Tooltips return after a native sort menu closes, hand ownership between elements without overlapping fade animations, and let the pointer pass through every hint.

- The comparison list fits the available content area and removes excess space at the end of the main scroll. Header controls and profile text use keyboard-accessible tooltips. The home link reacts to hover and focus and respects reduced motion.

- DuoFollow rejects inconsistent comparison data and keeps the previous result when a refresh returns an invalid reply.

- Unfollows require final confirmation in the Connector window. After a lost response, the Connector checks the follow again using a read-only request and keeps the profile in the list when the outcome remains unknown.

- The **Partial** label opens and closes its explanation without resizing neighboring cards.

- Browser tabs share Duolingo session checks. After HTTP 429, the extension pauses new session checks, comparisons, and unfollow requests until the shared retry deadline.
- The site loads avatars from approved hosts and shows initials for other URLs.

- The header and footer stay in place while the main content scrolls. The scrollbar follows the site theme.
- Small screens place the sort control beside search and explain an unavailable non-mutual filter next to the view buttons.
- The list header highlights the selected view’s count and shows matches out of that total during search.
- Relationship markers now show a tooltip from the pointer or keyboard and keep profile rows free of status text.
- The page keeps a minimum width of 320 CSS px. Dialogs and notifications fit the visible viewport.
- The developer guide links to separate pages for the Connector, comparison, release checks, and roadmap.

### Fixed

- Profile text tooltips appear only when the name or username is visually truncated.

- The unfollow tooltip appears beside its button and does not intercept the pointer or cover the next row’s action.

- Returning to comparison from a directly opened privacy page restores the Connector connection.

- A malformed comparison reply shows an error and preserves the previous results.

- Connector messages distinguish expired sessions, rate limits, timeouts, and unexpected replies.

- Profile names and usernames use separate text directions. Search matches canonically equivalent Unicode names.
- Long usernames, translated list headings, and Connector buttons fit at 125% text size.
- Returning from the privacy policy or access page rechecks a failed Connector status before showing a warning.
