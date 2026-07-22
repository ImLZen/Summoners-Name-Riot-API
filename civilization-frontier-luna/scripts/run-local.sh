#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "Civilization Frontier mechanics lab: http://localhost:8080/prototype/"
python3 -m http.server 8080
