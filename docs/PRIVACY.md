# Privacy Policy: DataWeave Studio

**Last updated: 26 September 2026**

DataWeave Studio has no account, telemetry or analytics. Scripts run on an engine
bundled with the app. Two things do reach the developer, and both are described
below: an anonymous count of update checks, and feedback if you choose to send it.

## What stays on your device

- Your DataWeave scripts, payloads, sample data and test cases
- Saved workspaces, custom modules and snippets
- Encryption keys and secure-property values you enter
- Settings, configuration and logs

## When the app uses the internet

The app works fully offline. It connects in four cases, and none of them include
your scripts or data:

1. **Checking for updates.** The desktop app asks `ashutosh-vijay.dev` (or
   `dataweave-studio.pages.dev`) whether a newer version exists. You can turn this
   off in **Settings → Advanced**, and the Microsoft Store version never checks,
   since Windows handles its updates. Each check adds one to a daily count by app
   version and platform (for example "3.2.0, windows"). No IP address or identifier
   is stored with it.
2. **Downloading a Java library.** Only when you ask the Java tester to fetch one
   from Maven Central (`repo1.maven.org`).
3. **Sending feedback.** After you have used the app for a while, it asks for a
   rating with an optional comment. If you skip, nothing is sent and it asks again
   in a couple of weeks, unless you tell it not to. Once you send a rating, it stops
   asking. A rating stores the score, your comment, the app version, whether it came
   from the desktop app or VS Code, and the date. To limit spam, a hash of your IP
   address and the date counts how many you send in a day; it can't be linked across
   days and is deleted the next day. Ratings are shown as totals on the
   [feedback page](https://ashutosh-vijay.dev/dataweave/feedback), and comments
   appear there after they have been read.
4. **Opening a link you clicked,** such as reporting a bug on GitHub, which opens a
   pre-filled issue in your browser for you to review.

## The built-in MCP server

DataWeave Studio can run a local MCP server so AI assistants on your machine can run
DataWeave against the real engine. It is off until you start it, and it listens on
`127.0.0.1`, so only programs on your own computer can reach it.

## Third parties and children

The app has no third-party analytics, advertising or tracking. Feedback and update
counts are stored with Cloudflare, which hosts the website, and are never sold or
shared. The app is a developer tool and is not directed at children.

## Your rights

Feedback is anonymous, so it can't be traced back to you. If you want a comment you
sent taken down, email the address below with its wording and it will be removed.
Everything else lives on your own device, and you can remove it by deleting your
workspaces or uninstalling the app.

## Contact

Questions: **issues@ashutosh-vijay.dev**

Source code: https://github.com/Ashutosh-Vijay/DataWeave-Studio

## Changes

If this policy changes, the new version will be posted here with a new "last
updated" date.
