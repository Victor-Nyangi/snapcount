#!/usr/bin/env bash
# Pull the newest nightly dump off the box onto this machine.
#
# WHY THIS EXISTS. The `db-backup` sidecar in compose.yml writes a pg_dump
# every night into the `snapcount_db-backups` volume — which lives on the same
# disk, in the same VM, as the database it is a backup of. That covers a
# dropped table or a bad migration. It does not cover losing the box. This is
# the step that makes the backup off-site, and it is manual on purpose: one
# more scheduled job with a key to the box is a bigger risk than remembering to
# run this after anything interesting happens.
#
# Usage:
#   ./scripts/pull-backup.sh [DEST_DIR]        # default ./backups/
#
# Overridable:
#   SNAPCOUNT_SSH_HOST    default 40.160.89.176
#   SNAPCOUNT_SSH_USER    default ubuntu
#   SNAPCOUNT_SSH_KEY     default ~/.ssh/snapcount_ovh
#   SNAPCOUNT_BACKUP_VOLUME  default snapcount_db-backups
#
# Idempotent: if the newest dump is already here at the same size, it is not
# copied again. Running this twice in a row is a no-op.
set -euo pipefail

DEST_DIR="${1:-./backups}"

SSH_HOST="${SNAPCOUNT_SSH_HOST:-40.160.89.176}"
SSH_USER="${SNAPCOUNT_SSH_USER:-ubuntu}"
SSH_KEY="${SNAPCOUNT_SSH_KEY:-$HOME/.ssh/snapcount_ovh}"
BACKUP_VOLUME="${SNAPCOUNT_BACKUP_VOLUME:-snapcount_db-backups}"

[ -f "$SSH_KEY" ] || {
  echo "no ssh key at $SSH_KEY — set SNAPCOUNT_SSH_KEY" >&2
  exit 1
}

# Everything that touches the box goes through here, and everything that
# touches the box is a READ. The volume is mounted :ro into a throwaway
# container, so a typo in one of these commands cannot damage the backups.
# postgres:18 rather than alpine because `db` already runs it, so this never
# pulls an image onto the box — and because it is where pg_restore lives.
in_volume() {
  ssh -i "$SSH_KEY" -o BatchMode=yes "$SSH_USER@$SSH_HOST" \
    "docker run --rm -v ${BACKUP_VOLUME}:/backups:ro --entrypoint sh postgres:18 -c '$1'"
}

echo "looking for the newest dump on $SSH_HOST ..."
# Timestamps in the filename sort lexicographically, so `sort | tail -1` is
# newest without asking the filesystem for mtimes. .partial files cannot match
# the glob, so a dump in flight is invisible here.
NEWEST=$(in_volume 'ls -1 /backups/snapcount-*.dump 2>/dev/null | sort | tail -n 1')

[ -n "$NEWEST" ] || {
  echo "no dumps in volume ${BACKUP_VOLUME} on $SSH_HOST." >&2
  echo "Is the db-backup service running? \`docker compose logs db-backup\` on the box." >&2
  exit 1
}

NAME=$(basename "$NEWEST")
REMOTE_SIZE=$(in_volume "stat -c %s $NEWEST")
echo "newest is $NAME ($REMOTE_SIZE bytes)"

mkdir -p "$DEST_DIR"
LOCAL="$DEST_DIR/$NAME"

if [ -f "$LOCAL" ] && [ "$(stat -c %s "$LOCAL" 2>/dev/null || stat -f %z "$LOCAL")" = "$REMOTE_SIZE" ]; then
  echo "already here at the same size — nothing to do: $LOCAL"
  exit 0
fi

# Streamed with `cat` rather than scp'd: the file only exists inside a Docker
# volume, so there is no path on the box to scp from, and this avoids first
# copying it out to the box's own disk. Local .partial for the same reason the
# sidecar uses one — an interrupted transfer must not leave something that
# looks like a backup.
echo "copying ..."
in_volume "cat $NEWEST" >"$LOCAL.partial"
mv "$LOCAL.partial" "$LOCAL"

LOCAL_SIZE=$(stat -c %s "$LOCAL" 2>/dev/null || stat -f %z "$LOCAL")
if [ "$LOCAL_SIZE" != "$REMOTE_SIZE" ]; then
  echo "size mismatch: got $LOCAL_SIZE bytes, expected $REMOTE_SIZE. Removing." >&2
  rm -f "$LOCAL"
  exit 1
fi

# A file of the right size can still be unreadable. `pg_restore --list` parses
# the archive's table of contents, which is the cheapest thing that proves this
# is a restorable custom-format dump and not, say, an error message.
echo "verifying ..."
list_toc() {
  if command -v pg_restore >/dev/null 2>&1; then
    pg_restore --list "$LOCAL"
  else
    # Same trick the other scripts use: matched client binaries from a
    # container instead of depending on what this laptop happens to have.
    docker run --rm -v "$(cd "$DEST_DIR" && pwd):/b:ro" \
      --entrypoint pg_restore postgres:18 --list "/b/$NAME"
  fi
}

# A dump that does not parse is worse than no dump, because it looks like one
# sitting in the folder. Delete it rather than leave it to be trusted later.
if ! TOC=$(list_toc); then
  echo "pg_restore could not read $LOCAL — not a valid archive. Removing." >&2
  rm -f "$LOCAL"
  exit 1
fi

ENTRIES=$(printf '%s\n' "$TOC" | grep -c '^[0-9]' || true)
if [ "$ENTRIES" -lt 1 ]; then
  echo "$LOCAL parsed but holds no archive entries — this dump is empty. Removing." >&2
  rm -f "$LOCAL"
  exit 1
fi

echo
echo "$LOCAL"
echo "$LOCAL_SIZE bytes, $ENTRIES archive entries — restorable."
echo "To restore it, see 'Backups' in deployment-snapcount.md."
