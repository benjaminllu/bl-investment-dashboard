#!/usr/bin/env bash
# One-time label setup for the issue tracker. Needs the GitHub CLI signed in
# (`gh auth login`). --force updates a label that already exists, so re-running
# is safe.
#
#   bash scripts/setup-github-labels.sh
set -euo pipefail

label() { gh label create "$1" --color "$2" --description "$3" --force; }

# Type
label bug         d73a4a "Something is wrong or broken"
label feature     10b981 "Something new to build"
label data        0ea5e9 "A data source or pipeline problem"
label design      a855f7 "Layout, copy or visual polish"

# Area
label portfolio   64748b "Portfolio tab and imports"
label positioning 64748b "Positioning tab"
label home        64748b "Home page and banner"
label infra       64748b "Workflows, scripts, deploys"

# Push tier, from CLAUDE.md: needs Ben's sign-off before it goes live
label amber       f59e0b "Finish, then ask before pushing"
label red         b91c1c "Never without Ben saying so in that moment"
