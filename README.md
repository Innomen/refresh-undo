# Refresh Undo

**An undo button for hitting refresh.** Born the day a YouTube video got taken down between watching it and reloading the tab — gone forever, one second after it was on screen.

Browsers treat everything they're displaying as disposable and re-fetchable: hit refresh and the page you were looking at is discarded from RAM and re-requested from the server. If the server says "that's gone now," it's gone for you too, even though it was *just there*. No browser offers a way back.

Refresh Undo makes refresh non-destructive:

- **Save-states every page.** The full rendered DOM (text, layout, comments — everything on screen) is snapshotted right before any refresh or navigation, when a tab loses focus, and every 30 seconds while you browse. Snapshots are kept for 48 hours (5 per URL, 400 total) in the extension's local IndexedDB. Nothing leaves your machine.
- **One-keypress restore.** `Ctrl+Shift+Z` (or the toolbar popup) reopens the latest snapshot of the current tab — scripts disabled, scroll position preserved. The popup lists all recent snapshots.
- **Refresh can't kill a YouTube tab.** F5 / Ctrl+R on YouTube opens a fresh copy in a **new tab**, leaving the original tab — player, buffer, comments — untouched. A popup checkbox extends this to every site.

## Install

Chromium-based browsers (built and tested on Brave):

1. Open `brave://extensions` (or `chrome://extensions`)
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select the `extension/` folder

## Honest limits

- The toolbar reload **button** and menu reload can't be intercepted by any extension — only keyboard refresh can. The snapshot layer is the safety net for those.
- A DOM snapshot cannot contain **video/audio streams** — media lives in decoder memory, never in the page. That's what `yt-dashcam/` is for.
- Snapshots are static: scripts are disabled on restore, and images load from the live site if it's still up.

## yt-dashcam (optional companion)

A systemd user service that makes YouTube takedowns powerless against you: it polls your Brave history every minute and immediately downloads (via [yt-dlp](https://github.com/yt-dlp/yt-dlp)) every video you open, up to 1080p, with metadata and thumbnail, to `~/Videos/yt-dashcam/` — auto-pruned after 7 days.

```
cp yt-dashcam/yt-dashcam.sh ~/.local/bin/ && chmod +x ~/.local/bin/yt-dashcam.sh
cp yt-dashcam/yt-dashcam.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now yt-dashcam.timer
```

Requires `yt-dlp` and `sqlite3`. Tune `KEEP_DAYS`, `MAX_HEIGHT`, and the history DB path at the top of the script (defaults assume Brave's default profile).

## The third layer

For everything else — livestreams, DRM, anything that ever hits your screen — use [gpu-screen-recorder](https://git.dec05eba.com/gpu-screen-recorder/about/)'s replay buffer: a ShadowPlay-style rolling last-hour recording of your screen, one hotkey to save. Between the three layers, nothing you've seen is more than a keypress from being a file.
