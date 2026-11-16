# DuoFollow

[Читать на русском](README.md)

DuoFollow shows which accounts you follow on Duolingo that don’t follow you back.

You’ll need desktop Chrome and the **DuoFollow Connector** extension. To build and run both from this repository, see [Install from source](#install-from-source).

## How to use it

1. Sign in to Duolingo and open [DuoFollow](https://hedgerock.github.io/duofollow/) in the same Chrome profile.
2. Select **Manage Duolingo access**. Read which data DuoFollow uses, select **Open settings**, and choose **Grant access**.
3. Return to DuoFollow, enter the username of the signed-in account, and select **Compare my follows**.
4. Choose a list view and search by name or `@username`. Use the sort control next to search to change the order. The arrow on each row opens that person’s Duolingo profile.
5. To unfollow a non-mutual profile, select the person icon with a minus and confirm in the dialog.

The result cards show how many follows and followers DuoFollow checked. The counter to the right of the list heading shows how many profiles are in the selected view. During search it shows matches out of that view’s total.

Colored bars in the all-received view show each profile’s status. If the followers list is incomplete, the **Non-mutual** filter is disabled and an explanation appears below the view buttons. The header links to the profile used for the comparison.

If DuoFollow asks you to enable the extension or sign in to Duolingo, follow the steps in the dialog and select **Check again**.

To revoke access, select the lock in the header, open the Connector settings, and choose **Disconnect**. You can also open the settings from the extension icon. The header lets you change the site language and theme.

## Install from source

With Node.js 22 installed, run these commands from the repository root.

```sh
npm ci
npm --prefix extension ci
npm --prefix extension run build
```

Open `chrome://extensions`, enable **Developer mode**, and use **Load unpacked** to select `extension/dist`. Copy the extension ID into a file named `.env.local` in the repository root.

```dotenv
VITE_DUOFOLLOW_EXTENSION_ID=<your extension ID>
```

Run `npm run dev -- --strictPort` and use DuoFollow at [http://localhost:5173/duofollow/](http://localhost:5173/duofollow/).

[Privacy policy](https://hedgerock.github.io/duofollow/privacy/)

[Developer guide (Russian)](docs/guidelines/development-guidelines.md)

[Changelog](CHANGELOG.md)
