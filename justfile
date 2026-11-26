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
setup: ensure-deps rebuild-native
    #!/usr/bin/env bash
    set -euo pipefail
    echo "[just] building backend & frontend (production) ..."
    npm --prefix {{backend}} run build
    npm --prefix {{frontend}} run build
    echo "[just] setup complete. Run 'just dev' or 'just start'."

# run dev servers (backend :3001 api / frontend :3000); Ctrl+C stops both cleanly
dev: ensure-deps rebuild-native check-ports
    #!/usr/bin/env bash
    set -uo pipefail
    npm --prefix {{root}} run dev &
    CHILD=$!
    trap 'kill -TERM $CHILD 2>/dev/null; wait $CHILD 2>/dev/null' EXIT INT TERM
    wait $CHILD

# production build (backend + frontend)
build: ensure-deps rebuild-native
    #!/usr/bin/env bash
    set -euo pipefail
    npm --prefix {{backend}} run build
    npm --prefix {{frontend}} run build
    echo "[just] build done. Run 'just start'."

# production run (build if needed + serve); Ctrl+C stops both cleanly
start: check-ports ensure-deps rebuild-native build
    #!/usr/bin/env bash
    set -uo pipefail
    npm --prefix {{root}} run start &
    CHILD=$!
    trap 'kill -TERM $CHILD 2>/dev/null; wait $CHILD 2>/dev/null' EXIT INT TERM
    wait $CHILD

# fail fast if ports are already taken — never kill blindly
check-ports:
    #!/usr/bin/env bash
    set -uo pipefail
    bad=0
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
            echo "[just] port $port is already in use (PID $(echo $pids | tr '\n' ' '))."
            echo "        Leftover of this app? Run 'just stop'. Otherwise stop that program first."
            bad=1
        fi
    done
    if [ $bad -eq 1 ]; then exit 1; fi
    echo "[just] ports 3000/3001 are free."

# manual cleanup: free ports 3000/3001 by killing whatever listens on them
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
    if [ $ok -eq 1 ]; then
        echo "[just] dependencies already installed."
    fi
    exit 0


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
