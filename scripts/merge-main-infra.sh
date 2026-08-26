#!/usr/bin/env bash
# Merge origin/main into the current artwork branch:
#   - keep artwork sketch / params / movers / palettes
#   - take infra from main (bootstrap, gitignore, package.json, …)
#   - leave mixed files for manual resolve (index.html, style.css, sketch-shaders.js)
#
# Lives in the shared library (often a submodule) but ALWAYS merges the
# artwork superproject — never generative-utils itself.
#
# Usage (from artwork repo root, on an artwork branch):
#   ./project/public/library/scripts/merge-main-infra.sh
#   ./project/public/library/scripts/merge-main-infra.sh origin/main
#
# Afterward: resolve MANUAL files if needed, then:
#   npm run bootstrap   # once main’s bootstrap exists
#   npm start

set -euo pipefail

# Resolve the artwork repo even when this file is inside the library submodule.
find_artwork_root() {
	local script_dir lib_root super toplevel dir
	script_dir="$(cd "$(dirname "$0")" && pwd)"
	lib_root="$(cd "$script_dir/.." && pwd)"

	super="$(git -C "$lib_root" rev-parse --show-superproject-working-tree 2>/dev/null || true)"
	if [[ -n "$super" ]]; then
		echo "$super"
		return 0
	fi

	# Legacy copy at <artwork>/scripts/merge-main-infra.sh
	toplevel="$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null || true)"
	if [[ -n "$toplevel" && -d "$toplevel/project/public" ]]; then
		echo "$toplevel"
		return 0
	fi

	dir="$script_dir"
	while [[ "$dir" != "/" ]]; do
		if [[ -f "$dir/package.json" && -d "$dir/project/public" ]] \
			&& git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
			echo "$dir"
			return 0
		fi
		dir="$(dirname "$dir")"
	done

	return 1
}

ROOT="$(find_artwork_root)" || {
	echo "error: could not find the artwork repo root." >&2
	echo "This script merges the parent project, not the library submodule." >&2
	echo "Run it from a project that vendors this library (e.g. project/public/library)." >&2
	exit 1
}

echo "==> artwork repo: $ROOT"
cd "$ROOT"

MAIN_REF="${1:-origin/main}"
BRANCH="$(git branch --show-current)"

if [[ -z "$BRANCH" ]]; then
	echo "error: detached HEAD — check out an artwork branch first" >&2
	exit 1
fi

if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
	echo "error: run this on an artwork branch, not $BRANCH" >&2
	exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "error: working tree is dirty — commit or stash first" >&2
	git status -sb
	exit 1
fi

if [[ -n "$(git ls-files -u)" ]]; then
	echo "error: a merge is already in progress — finish or abort it first" >&2
	exit 1
fi

echo "==> fetching"
git fetch origin

if ! git rev-parse --verify "$MAIN_REF" >/dev/null 2>&1; then
	echo "error: unknown ref $MAIN_REF" >&2
	exit 1
fi

echo "==> merging $MAIN_REF into $BRANCH"
set +e
git merge --no-edit --no-commit "$MAIN_REF"
MERGE_STATUS=$?
set -e

if [[ $MERGE_STATUS -ne 0 && $MERGE_STATUS -ne 1 ]]; then
	echo "error: merge failed (exit $MERGE_STATUS)" >&2
	exit "$MERGE_STATUS"
fi

# During merge: HEAD = artwork (ours), MERGE_HEAD = main (theirs)
take_ours() {
	local f
	for f in "$@"; do
		if git cat-file -e "HEAD:$f" 2>/dev/null; then
			git checkout HEAD -- "$f"
			echo "  keep artwork: $f"
		elif [[ -e "$f" ]]; then
			git rm -f --ignore-unmatch "$f" >/dev/null 2>&1 || rm -f "$f"
			echo "  drop (not on artwork): $f"
		fi
	done
}

take_main() {
	local f
	for f in "$@"; do
		if git cat-file -e "MERGE_HEAD:$f" 2>/dev/null; then
			git checkout MERGE_HEAD -- "$f"
			echo "  take main:    $f"
		fi
	done
}

echo "==> applying rules"

# Artwork-owned (never overwrite with main's template)
ARTWORK_FILES=(
	project/public/sketch.js
	project/public/parameters/params.js
	project/public/shapes/mover.js
	project/public/modules/mover.js
	project/public/palettes/palettes.js
	project/src/index.js
)
take_ours "${ARTWORK_FILES[@]}"

# Also keep any swatches tree from artwork if present
if git ls-tree -r --name-only HEAD -- project/public/swatches 2>/dev/null | grep -q .; then
	git checkout HEAD -- project/public/swatches
	echo "  keep artwork: project/public/swatches/"
fi

# Infra from main (paths are in the artwork repo, not the library).
# scripts/merge-main-infra.sh is kept for older mains that still ship it at root.
INFRA_FILES=(
	.gitignore
	.gitmodules
	package.json
	package-lock.json
	README.md
	lib/scripts/bootstrap-lib.js
	scripts/bootstrap-lib.js
	scripts/merge-main-infra.sh
)
take_main "${INFRA_FILES[@]}"

# Mixed: leave as merge produced (conflicts stay unmerged for you)
MANUAL_FILES=(
	project/public/index.html
	project/public/style.css
	project/public/shaders/sketch-shaders.js
)

echo "==> manual review (mixed infra + artwork)"
for f in "${MANUAL_FILES[@]}"; do
	if git ls-files -u -- "$f" | grep -q .; then
		echo "  CONFLICT: $f  — resolve, then git add $f"
	elif [[ -f "$f" ]]; then
		echo "  check:    $f  — confirm panel scripts/CSS/APIs without losing artwork"
	fi
done

echo
if [[ -n "$(git ls-files -u)" ]]; then
	echo "Merge paused with conflicts still open:"
	git ls-files -u | awk '{print $4}' | sort -u | sed 's/^/  /'
	echo
	echo "Resolve them, git add <files>, then:"
	echo "  git commit"
else
	echo "No open conflicts. Review the MANUAL files above, then:"
	echo "  git status"
	echo "  git commit   # completes the merge (--no-commit was used)"
fi

echo
echo "After commit:"
if [[ -f lib/scripts/bootstrap-lib.js ]]; then
	echo "  npm run bootstrap && npm start"
elif [[ -f scripts/bootstrap-lib.js ]]; then
	echo "  node ./scripts/bootstrap-lib.js && npm start"
else
	echo "  npm start"
fi
echo
echo "Remember: sketch.js kept from $BRANCH. Re-check ENABLE_DEV_PANELS / key E / panel script tags if needed."
