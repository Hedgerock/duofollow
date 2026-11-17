# DuoFollow

[Русская версия](README.md)

DuoFollow compares an account’s follows and followers on Duolingo and shows non-mutual follows.

Desktop Chrome and the **DuoFollow Connector** extension are required. Build and setup instructions are available under [Install from source](#install-from-source).

## How to use it

1. [DuoFollow](https://hedgerock.github.io/duofollow/) requires an active Duolingo session in the same Chrome profile.
2. The **Manage Duolingo access** page explains which data DuoFollow uses. **Open settings** opens the Connector settings, where **Grant access** enables access.
3. The comparison form on the DuoFollow home page takes the username of the signed-in account. **Compare my follows** starts the comparison.
4. The view controls switch between lists, and search finds profiles by name or `@username`. The sort control sits next to search. The arrow on each row opens the corresponding Duolingo profile.
5. The person icon with a minus opens a confirmation dialog for unfollowing a non-mutual profile.

The result cards show how many follows and followers DuoFollow checked. **Partial** opens an explanation of why only part of a list was checked. The counter to the right of the list heading shows how many profiles are in the selected view. During search it shows matches out of that view’s total.

Colored bars in the all-received view show each profile’s status. If the followers list is incomplete, the **Non-mutual** filter is disabled and an explanation appears below the view buttons. The header links to the profile used for the comparison.

When the extension is disabled or the Duolingo session is missing, the dialog describes the steps to restore the connection. **Check again** updates the connection status.

The lock in the header opens the access page, which links to the Connector settings. **Disconnect** in those settings revokes access. The extension icon also opens the settings. The header contains language and theme controls. **Settings** provides text size, typeface, and follow status pattern options.

## Install from source

The build requires Node.js 22.13 or a newer 22.x release. The following commands run from the repository root.

```sh
npm ci
npm --prefix extension ci
npm --prefix extension run build
```

Installation from `extension/dist` uses **Load unpacked** on `chrome://extensions` with **Developer mode** enabled. The extension ID goes into `.env.local` in the repository root.

```dotenv
VITE_DUOFOLLOW_EXTENSION_ID=<installed extension ID>
```

The command `npm run dev -- --strictPort` starts DuoFollow at [http://localhost:5173/duofollow/](http://localhost:5173/duofollow/).

[Privacy policy](https://hedgerock.github.io/duofollow/privacy/)

[Developer guide (Russian)](docs/guidelines/development-guidelines.md)

[Changelog](CHANGELOG.md)
