# Chrome Web Store Listing — Unfolks

> Last Updated: 2026-09-15

## Store Listing

**Extension Name** [REQUIRED]
Unfolks - Find who doesn't follow you back on Instagram!

**Short Description** [REQUIRED]
Find Instagram accounts that don't follow you back and unfollow them from a side panel.

**Detailed Description** [REQUIRED]
Unfolks shows which Instagram accounts you follow that do not follow you back, and lets you unfollow them without leaving the page.

FEATURES
• Scan your following list to see who does not follow you back
• Search, sort, and filter verified vs regular accounts
• Unfollow one account at a time, or unfollow several with a pause between each action so Instagram is less likely to block you
• Keeps the last scan on your computer so you can reopen the panel and continue
• Works in a side panel that stays open while you browse

HOW TO USE
1. Open Instagram in Chrome and sign in
2. Click the Unfolks icon in the toolbar to open the side panel
3. Click "Show unfollowers" (or "Refresh the list") and wait for the scan to finish
4. Review the list, then unfollow accounts one by one or in a batch

PRIVACY
Your following list, scan results, and profile name stay on this computer. Unfolks does not send your Instagram password anywhere. If something crashes, a report may go to Sentry so the problem can be fixed. See the privacy policy for details.

PERMISSIONS
• Storage — keeps a short-lived copy of the latest scan/account update if Chrome restarts background work before the side panel reconnects
• Side panel — opens Unfolks beside the page instead of covering Instagram
• Instagram and image hosts — needed to read your following list, unfollow, and show profile photos. The extension does not run on other websites.

SUPPORT
Questions or bugs: mail@ozgurozalp.com
Source: https://github.com/ozgurozalp/unfolks

Version 1.3.1

**Category** [REQUIRED]
Social & Communication

**Single Purpose** [REQUIRED]
Finds Instagram accounts that don't follow you back and lets you unfollow them.

**Primary Language** [REQUIRED]
English (Turkish locale included)


## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | chrome-extension/public/icon-128.png |
| Toolbar 16 | 16×16 PNG | ✅ Ready | chrome-extension/public/icon-16.png |
| Toolbar 32 | 32×32 PNG | ✅ Ready | chrome-extension/public/icon-32.png |
| Toolbar 48 | 48×48 PNG | ✅ Ready | chrome-extension/public/icon-48.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 4 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 5 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
1. Side panel open next to an Instagram tab, showing the unfollower list after a scan.
2. First-run onboarding with Instagram closed vs open, and the "Show unfollowers" button.
3. Unfollow confirmation dialog and the temporary block countdown, so reviewers see the extension is careful with Instagram limits.


## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Holds the latest account/scan message if Chrome stops background work before the side panel reconnects, so your name and list still appear when you reopen it. Scan results you keep between visits are stored on this computer only. |
| sidePanel | permissions | Opens Unfolks beside the page so you can review unfollowers without covering Instagram. Chrome only. |
| https://instagram.com/* | host_permissions | Reads your following/follower lists and sends unfollow requests on Instagram while you are signed in. Does not run on other sites. |
| https://*.instagram.com/* | host_permissions | Same as above for www, m, and other Instagram subdomains. |
| https://*.cdninstagram.com/* | host_permissions | Loads profile photos in the unfollower list. |
| https://*.fbcdn.net/* | host_permissions | Loads profile photos when Instagram serves them from this image host. |


## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Yes (Instagram name, username, profile photo URL stored locally) | Crash reports only | Show whose account was scanned | Sentry, if a crash includes that text |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | No (uses the Instagram session already in the tab; does not store passwords) | No | — | No |
| Personal communications | No | No | — | No |
| Location | No | No | — | No |
| Web history | No | No | — | No |
| User activity | Yes (scan times, unfollow actions, block cooldown) | Crash reports only | Show last scan, prevent rapid unfollows | Sentry, if a crash includes that text |
| Website content | Yes (following/follower lists from Instagram) | No, except crash reports | Build the unfollower list | Sentry, if a crash includes that text |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes


## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/ozgurozalp/unfolks/blob/main/PRIVACY.md

<!-- This URL is live only after PRIVACY.md is on the default branch. Host a copy on ozgurozalp.com if the GitHub link is not acceptable to review. -->


## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
Özgür ÖZALP

**Contact Email** [REQUIRED]
mail@ozgurozalp.com

**Support URL / Email** [RECOMMENDED]
mail@ozgurozalp.com
https://github.com/ozgurozalp/unfolks/issues

**Homepage URL** [RECOMMENDED]
https://ozgurozalp.com


## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.3.1 | 2026-09-15 | Store-readiness: real toolbar/store icons, narrower Instagram-only content scripts, no public extension assets, persist panel messages across background restarts. | Draft |


## Review Notes

### Known Issues / Limitations
- Store screenshots (1280×800 or 640×400) still need to be captured from a running build before submission.
- Privacy policy URL is the GitHub file. Publish that file (or a site copy) before submitting.
- The listing name includes "Instagram" because the extension only works there. Do not use Instagram's logo in screenshots.
- ZIP the `dist` output from `pnpm zip`. That folder does not include `.git`, `node_modules`, `CHROMEWEBSTORE.md`, or `PRIVACY.md`.
- Sentry is compiled into the extension. The data disclosure form must list crash reporting.

### Rejection History
<!-- None yet. -->
