#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  debug () {
    [ "$HUSKY_DEBUG" = "1" ] && echo "husky (debug) - $1"
  }
  readonly hook_name="$(basename "$0")"
  debug "starting $hook_name..."
  if [ "$HUSKY" = "0" ]; then
    debug "HUSKY env variable is set to 0, skipping hook"
    exit 0
  fi
  if [ ! -f package.json ]; then
    debug "package.json not found, skipping hook"
    exit 0
  fi
  command -v node >/dev/null 2>&1 || { debug "node not found, skipping hook"; exit 0; }
  if [ -f .huskyrc ]; then
    debug ".huskyrc detected, source it"
    . .huskyrc
  fi
  export readonly husky_skip_init=1
  sh -e "$0" "$@"
  exitCode="$?"
  unset husky_skip_init
  exit "$exitCode"
fi
