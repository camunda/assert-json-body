#!/usr/bin/env bash
set -euo pipefail

# Build standalone Deno binaries for assert-json-body CLI.
#
# Uses a clean staging directory with only production dependencies
# to keep binary size small (~30-40MB vs ~240MB with devDeps).
#
# Usage:
#   ./scripts/build-deno.sh                    # local platform only
#   ./scripts/build-deno.sh --cross            # all supported platforms
#   ./scripts/build-deno.sh --target <target>  # specific target

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING_DIR="$(mktemp -d)"
OUT_DIR="${REPO_ROOT}/dist-bin"
DENO_ENTRY="deno-entry.ts"

TARGETS_ALL=(
  x86_64-unknown-linux-gnu
  aarch64-unknown-linux-gnu
  x86_64-apple-darwin
  aarch64-apple-darwin
  x86_64-pc-windows-msvc
)

cleanup() {
  rm -rf "${STAGING_DIR}"
}
trap cleanup EXIT

# Parse args
CROSS=false
SINGLE_TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cross) CROSS=true; shift ;;
    --target) SINGLE_TARGET="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "==> Staging production-only build in ${STAGING_DIR}"

# Copy source files needed for compilation
cp "${REPO_ROOT}/package.json" "${STAGING_DIR}/"
cp "${REPO_ROOT}/package-lock.json" "${STAGING_DIR}/" 2>/dev/null || true
cp "${REPO_ROOT}/${DENO_ENTRY}" "${STAGING_DIR}/"
cp "${REPO_ROOT}/deno.json" "${STAGING_DIR}/"
cp -r "${REPO_ROOT}/src" "${STAGING_DIR}/src"

# Install only production dependencies
echo "==> Installing production dependencies only"
cd "${STAGING_DIR}"
npm ci --omit=dev --ignore-scripts 2>&1 | tail -3

# Compile
mkdir -p "${OUT_DIR}"

compile_target() {
  local target="$1"
  local suffix=""
  [[ "$target" == *windows* ]] && suffix=".exe"
  local out_name="assert-json-body-${target}${suffix}"

  echo "==> Compiling for ${target} -> ${out_name}"
  deno compile \
    --no-check \
    --allow-all \
    --target "${target}" \
    --output "${OUT_DIR}/${out_name}" \
    "${STAGING_DIR}/${DENO_ENTRY}" 2>&1

  echo "    $(ls -lh "${OUT_DIR}/${out_name}" | awk '{print $5}')"
}

if [[ -n "${SINGLE_TARGET}" ]]; then
  compile_target "${SINGLE_TARGET}"
elif [[ "${CROSS}" == true ]]; then
  for target in "${TARGETS_ALL[@]}"; do
    compile_target "${target}"
  done
else
  # Local platform only
  echo "==> Compiling for local platform"
  deno compile \
    --no-check \
    --allow-all \
    --output "${OUT_DIR}/assert-json-body" \
    "${STAGING_DIR}/${DENO_ENTRY}" 2>&1

  echo "    Binary: $(ls -lh "${OUT_DIR}/assert-json-body" | awk '{print $5}')"
fi

echo "==> Done. Binaries in ${OUT_DIR}/"
ls -lh "${OUT_DIR}/"
