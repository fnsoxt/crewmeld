#!/bin/sh
set -e

AUTOGEN_ENV="/shared/autogen.env"

if [ -f "$AUTOGEN_ENV" ]; then
  echo "📥 Merging $AUTOGEN_ENV (user .env values take precedence)"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    [ -z "$key" ] && continue

    eval "current=\${$key-__UNSET__}"
    if [ "$current" = "__UNSET__" ] || [ -z "$current" ]; then
      export "$key=$val"
      echo "  + $key"
    else
      echo "  - $key (kept from .env)"
    fi
  done < "$AUTOGEN_ENV"
else
  echo "ℹ️  No /shared/autogen.env found (OK if --profile k3s is not active)"
fi

exec "$@"
