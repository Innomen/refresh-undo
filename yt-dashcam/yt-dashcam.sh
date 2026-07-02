#!/usr/bin/env bash
# yt-dashcam: archive every YouTube video opened in Brave, so takedowns
# after the fact can't destroy content you already watched.
# Runs from a systemd user timer (yt-dashcam.timer) every minute.
set -u
export PATH="$HOME/.pyenv/shims:$HOME/.pyenv/bin:/usr/local/bin:/usr/bin:/bin"

ARCHIVE_DIR="$HOME/Videos/yt-dashcam"
STATE_DIR="$HOME/.local/state/yt-dashcam"
SEEN="$STATE_DIR/seen_ids.txt"
LOG="$STATE_DIR/yt-dashcam.log"
HIST="$HOME/.config/BraveSoftware/Brave-Browser/Default/History"
KEEP_DAYS="${KEEP_DAYS:-7}"
LOOKBACK_MIN="${LOOKBACK_MIN:-360}"   # dedup via seen file makes a wide window safe
MAX_HEIGHT="${MAX_HEIGHT:-1080}"

mkdir -p "$ARCHIVE_DIR" "$STATE_DIR"
touch "$SEEN"

exec 9>"$STATE_DIR/lock"
flock -n 9 || exit 0

# Copy the DB so we never touch Brave's live (locked) file
TMPHIST=$(mktemp) || exit 1
trap 'rm -f "$TMPHIST"' EXIT
cp "$HIST" "$TMPHIST" || exit 1

# last_visit_time is microseconds since 1601-01-01 (Chrome epoch)
URLS=$(sqlite3 "$TMPHIST" "SELECT url FROM urls WHERE (url LIKE '%youtube.com/watch%' OR url LIKE '%youtu.be/%' OR url LIKE '%youtube.com/shorts/%') AND last_visit_time > (strftime('%s','now') - ${LOOKBACK_MIN}*60 + 11644473600)*1000000;")

IDS=$(printf '%s\n' "$URLS" \
  | grep -oE '(v=|youtu\.be/|shorts/)[A-Za-z0-9_-]{11}' \
  | sed -E 's#^(v=|youtu\.be/|shorts/)##' | sort -u)

for id in $IDS; do
    grep -qxF -e "$id" "$SEEN" && continue
    echo "$id" >> "$SEEN"
    if [ "${DRYRUN:-0}" = "1" ]; then
        echo "$(date '+%F %T') DRYRUN would archive $id" >> "$LOG"
        continue
    fi
    echo "$(date '+%F %T') archiving $id" >> "$LOG"
    yt-dlp --no-playlist --no-progress --restrict-filenames \
        --write-info-json --write-thumbnail \
        -f "bv*[height<=${MAX_HEIGHT}]+ba/b[height<=${MAX_HEIGHT}]/b" \
        -o "$ARCHIVE_DIR/%(upload_date|unknown)s_%(title).80s_%(id)s.%(ext)s" \
        -- "$id" >> "$LOG" 2>&1 &
done
wait

# Rolling window: drop archived files older than KEEP_DAYS
find "$ARCHIVE_DIR" -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null

# Keep state files from growing forever
tail -n 5000 "$SEEN" > "$SEEN.tmp" && mv "$SEEN.tmp" "$SEEN"
[ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 20000 ] && tail -n 10000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
