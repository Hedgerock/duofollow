# Changelog

## Unreleased

### Added

- Comparison results show how many follows and followers were checked.
- Switch between all received, mutual, and non-mutual follows. The all-received view highlights mutual follows and labels unconfirmed profiles when the followers list is incomplete.
- Follows can be sorted by name in either direction or shown in the order received.
- Browser integration tests and screenshot comparisons can run in Docker Compose.

### Changed

- The header and footer stay in place while the main content scrolls. The scrollbar follows the site theme.

- Relationship markers now show a tooltip from the pointer or keyboard and keep profile rows free of status text.

- The page keeps a minimum width of 320 CSS px. Dialogs and notifications fit the visible viewport.
- The developer guide links to separate pages for the Connector, comparison, release checks, and roadmap.

### Fixed

- Profile names and usernames use separate text directions. Search matches canonically equivalent Unicode names.
- Returning from the privacy policy or access page rechecks a failed Connector status before showing a warning.
