# ============================================================================
#  Rubric Survey — one-command environment bootstrap & runner
#  Usage:
#    just              -> list recipes
#    just setup        -> first-time setup (install all deps + rebuild native)
#    just dev          -> run dev servers (backend :3001 api / frontend :3000)
#    just build        -> production build (backend + frontend)
#    just start        -> production run (build if needed + serve)
#    just rebuild-native
#                      -> recompile better-sqlite3 against CURRENT node
#                         (fixes NODE_MODULE_VERSION mismatch errors)
#    just status       -> check if backend/frontend are listening
#    just reset-db     -> wipe SQLite data (re-seeded on next backend start)
# ============================================================================

set shell := ["bash", "-c"]

root        := justfile_directory()
backend     := root + "/backend"
frontend    := root + "/frontend"

# list available recipes
default:
    @just --list

# first-time setup: install deps + rebuild native + production build
setup: ensure-deps rebuild-native sync-rubric
    #!/usr/bin/env bash
    set -euo pipefail
    echo "[just] building backend & frontend (production) ..."
    npm --prefix {{backend}} run build
    npm --prefix {{frontend}} run build
    echo "[just] setup complete. Run 'just dev' or 'just start'."

# run dev servers (backend :3001 api / frontend :3000)
dev: stop ensure-deps rebuild-native sync-rubric
    npm --prefix {{root}} run dev

# production build (backend + frontend)
build: ensure-deps rebuild-native sync-rubric
    #!/usr/bin/env bash
    set -euo pipefail
    npm --prefix {{backend}} run build
    npm --prefix {{frontend}} run build
    echo "[just] build done. Run 'just start'."

# production run (build if needed + serve)
start: stop build
    npm --prefix {{root}} run start

# free ports 3000/3001 by killing leftover processes (fixes EADDRINUSE after Ctrl+C)
stop:
    #!/usr/bin/env bash
    set -uo pipefail
    freed=0
    for port in 3000 3001; do
        pids=""
        if command -v lsof >/dev/null 2>&1; then
            pids=$(lsof -t -i tcp:$port 2>/dev/null)
        elif command -v fuser >/dev/null 2>&1; then
            pids=$(fuser $port/tcp 2>/dev/null | tr -s ' ' '\n')
        elif command -v ss >/dev/null 2>&1; then
            pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u)
        fi
        pids=$(echo "$pids" | tr -s ' ' '\n' | grep -v '^$' | sort -u)
        if [ -n "$pids" ]; then
            echo "[just] port $port in use — stopping: $(echo $pids | tr '\n' ' ')"
            kill $pids 2>/dev/null || true
            sleep 1
            kill -9 $pids 2>/dev/null || true
            freed=1
        fi
    done
    [ $freed -eq 1 ] || echo "[just] ports 3000/3001 are free."

# recompile better-sqlite3 against CURRENT node (run after switching node versions;
# fixes "compiled against a different Node.js version ... NODE_MODULE_VERSION")
rebuild-native:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "[just] node $(node -v) — rebuilding better-sqlite3 to match ..."
    cd {{backend}}
    npm rebuild better-sqlite3
    echo "[just] better-sqlite3 rebuilt for $(node -v)."

# install dependencies only when missing
ensure-deps:
    #!/usr/bin/env bash
    set -euo pipefail
    ok=1
    for d in {{root}} {{backend}} {{frontend}}; do
        if [ ! -d "$d/node_modules" ]; then
            echo "[just] node_modules missing in $d — installing ..."
            npm --prefix "$d" install --no-audit --no-fund
            ok=0
        fi
    done
    [ $ok -eq 1 ] && echo "[just] dependencies already installed."

# sync the single-source rubric.json into backend & frontend
sync-rubric:
    @node {{root}}/scripts/sync-rubric.mjs

# check whether backend/frontend are listening + show URLs
status:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "node:        $(node -v)"
    probe() {
        local url="$1"; shift
        local code
        code=$(curl -s -o /dev/null -w "%{http_code}" "$@") || code="000"
        if [ "$code" = "200" ] || [ "$code" = "401" ] || [ "$code" = "400" ]; then
            echo "running ✓ ($code)"
        else
            echo "not running ($code)"
        fi
    }
    printf "backend-api: "; probe x -X POST "http://localhost:3001/api/admin/login" \
        -H 'Content-Type: application/json' -d '{"password":"__probe__"}'
    printf "frontend:    "; probe x "http://localhost:3000/"
    echo "survey page: http://localhost:3000   (access code: eval2026)"
    echo "admin page:  http://localhost:3000/admin   (password: admin123)"

# wipe the SQLite database (demo cases re-seeded on next backend start)
reset-db:
    rm -rf {{backend}}/data
    @echo "[just] database removed."
