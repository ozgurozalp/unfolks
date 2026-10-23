# Chrome Web Store Listing — Unfolks

> Last Updated: 2026-10-21

## Store Listing

**Extension Name** [REQUIRED]
Unfolks - Find who doesn't follow you back on Instagram!

**Short Description** [REQUIRED]
Find Instagram accounts that don't follow you back and unfollow them from a side panel.

**Detailed Description** [REQUIRED] — English
Unfolks shows which Instagram accounts you follow that do not follow you back, and lets you unfollow them from a side panel next to Instagram.

FEATURES
• Scan your following list and see who does not follow you back
• Search, sort, and filter: verified, not verified, private, no profile photo
• Hide accounts you want to keep; hidden accounts are never unfollowed in bulk
• Select accounts (double-click a card or "Select all") and unfollow only those, or copy their usernames
• Unfollow at a safe pace: a wait between every unfollow and a longer rest every few accounts, both adjustable
• Choose the scan speed: fast, balanced, or careful
• If Instagram limits a scan, your progress is kept and you can resume later from where it stopped
• No-risk option: drop the file from Instagram's "Download your information" and see who doesn't follow you back without sending Instagram any request
• Works in a side panel that stays open while you browse

HOW TO USE
1. Open Instagram in Chrome and sign in
2. Click the Unfolks icon in the toolbar to open the side panel
3. Click "Show unfollowers" and wait for the scan to finish
4. Review the list, then unfollow accounts one by one or in a batch

PRIVACY
Your following list, scan results, and settings stay on this computer. Unfolks never asks for your Instagram password; it uses the session already open in your browser. Files from your Instagram data download are read in the panel and never uploaded. If something crashes, a report may go to Sentry so the problem can be fixed. See the privacy policy for details.

PERMISSIONS
• Storage — keeps your list, settings, and the progress of a stopped scan on this computer
• Side panel — opens Unfolks beside the page instead of covering Instagram
• Instagram and image hosts — needed to read your following list, unfollow, and show profile photos. The extension does not run on other websites.

SUPPORT
Questions or bugs: mail@ozgurozalp.com
Source: https://github.com/ozgurozalp/unfolks

**Detailed Description** — Türkçe (Turkish localization)
Unfolks, takip ettiğin hesaplardan hangilerinin seni geri takip etmediğini gösterir ve Instagram'ın yanındaki bir panelden takibi bırakmanı sağlar.

ÖZELLİKLER
• Takip listeni tara, seni geri takip etmeyenleri gör
• Ara, sırala ve filtrele: onaylı, onaysız, gizli hesap, profil fotoğrafı olmayan
• Tutmak istediğin hesapları gizle; gizlenen hesapların takibi toplu işlemde asla bırakılmaz
• Hesapları seç (karta çift tıkla ya da "Tümünü seç") ve yalnızca onları bırak ya da kullanıcı adlarını kopyala
• Takibi güvenli tempoda bırak: her işlem arasında bekleme ve birkaç hesapta bir uzun mola, ikisi de ayarlanabilir
• Tarama hızını seç: hızlı, dengeli ya da temkinli
• Instagram taramayı sınırlarsa ilerlemen kaybolmaz; daha sonra kaldığı yerden devam edebilirsin
• Risksiz seçenek: Instagram'ın "Bilgilerini indir" dosyasını bırak, Instagram'a hiçbir istek göndermeden seni geri takip etmeyenleri gör
• Gezinirken açık kalan bir yan panelde çalışır

NASIL KULLANILIR
1. Chrome'da Instagram'ı aç ve giriş yap
2. Araç çubuğundaki Unfolks simgesine tıklayıp yan paneli aç
3. "Takip etmeyenleri göster"e tıkla ve taramanın bitmesini bekle
4. Listeyi gözden geçir, takibi tek tek ya da toplu bırak

GİZLİLİK
Takip listen, tarama sonuçların ve ayarların bu bilgisayarda kalır. Unfolks Instagram şifreni asla istemez; tarayıcında zaten açık olan oturumu kullanır. Instagram veri dosyaların panelde okunur ve hiçbir yere yüklenmez. Bir çökme olursa sorunun düzeltilebilmesi için Sentry'ye bir hata raporu gidebilir. Ayrıntılar için gizlilik politikasına bakın.

DESTEK
Soru ve hatalar: mail@ozgurozalp.com
Kaynak kod: https://github.com/ozgurozalp/unfolks

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
| Screenshot 1 [REQUIRED] — the list | 1280×800 | ✅ Ready | store-assets/screenshots/en-1.png (tr-1.png) |
| Screenshot 2 — safe bulk unfollow | 1280×800 | ✅ Ready | store-assets/screenshots/en-2.png (tr-2.png) |
| Screenshot 3 — resume a stopped scan | 1280×800 | ✅ Ready | store-assets/screenshots/en-3.png (tr-3.png) |
| Screenshot 4 — data file check | 1280×800 | ✅ Ready | store-assets/screenshots/en-4.png (tr-4.png) |
| Screenshot 5 — speed settings | 1280×800 | ✅ Ready | store-assets/screenshots/en-5.png (tr-5.png) |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Asset Notes
- Screenshots use sample accounts only. Their profile photos are AI-generated and belong to no real person.
- `en-*` go on the English listing, `tr-*` on the Turkish localization.
- `store-assets/icon-512.png` is the source icon; it is not shipped in the package.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Keeps the user's scan results, settings and hidden accounts on this computer, holds the latest account/scan message if Chrome stops background work before the side panel reconnects, and keeps the progress of a scan that stopped partway (for up to 24 hours) so it can be resumed. Nothing is synced or sent off the device. |
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
| 1.4.1 | 2026-10-24 | Fewer Instagram session requests: the logged-in account is recognized from the Instagram cookie and its profile card is reused for up to 6 hours, with a fallback when Instagram rate-limits the request. Only the account id, name, username and profile photo URL are kept locally (no tokens). Clear message when a scan finishes while the panel is closed. No new permissions or hosts. | Submitted |
| 1.4.0 | 2026-10-21 | Resumable scans with cooldowns after Instagram limits, scan speed presets, safer bulk unfollow pacing with rests, GraphQL-only unfollow with confirmation, hide list, filters, selection and copy, offline Instagram data-file check, removed in-panel ad for another app, removed unused Instagram logo files from the package. No new permissions or hosts. | Draft |
| 1.3.4 | 2026-09-28 | Batched follow-back checks, follower paging backoff, rate-limit wait countdown in the panel, scan state survives closing and reopening the panel. Dev-only web-accessible resources (not in the store build). | Draft |
| 1.3.3 | 2026-09-27 | Verify follow-backs per account instead of trusting Instagram's following list, which is no longer chronological and mislabels some followers. No permission changes. | Draft |
| 1.3.2 | 2026-09-15 | Store-readiness: real toolbar/store icons, narrower Instagram-only content scripts, no public extension assets, persist panel messages across background restarts. | Draft |
| 1.3.1 | 2026-09-14 | Previous public build. | Draft |


## Review Notes

### Known Issues / Limitations
- Privacy policy URL is the GitHub file on `main`. Merge the 1.4.0 PR before submitting so the URL shows the updated policy.
- The listing name includes "Instagram" because the extension only works there. Do not use Instagram's logo in screenshots.
- Upload `dist-zip/extension.zip` produced by `pnpm zip`. It puts `manifest.json` at the archive root and excludes `.git`, `node_modules`, `CHROMEWEBSTORE.md`, and `PRIVACY.md`.
- Do NOT upload a Finder-made `dist.zip`. Finder nests everything under a `dist/` folder and adds `__MACOSX/._*` entries, so the store cannot find `manifest.json` and rejects the upload.
- Versions 1.3.2 through 1.4.1 added no new permissions or hosts; the Permissions Justification table above is still accurate.
- Sentry is compiled into the extension. The data disclosure form must list crash reporting.

### Rejection History
<!-- None yet. -->
