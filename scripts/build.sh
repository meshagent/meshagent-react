#!/bin/bash -eu

# This script generates 4 builds, as follows:
# - dist/esm: ESM build for Node.js
# - dist/esm-browser: ESM build for the Browser
# - dist/cjs: CommonJS build for Node.js
# - dist/cjs-browser: CommonJS build for the Browser
#
# Note: that the "preferred" build for testing (local and CI) is the ESM build,
# except where we specifically test the other builds

set -e # exit on error

# Change to project root
ROOT=`pwd`

DIST_DIR="$ROOT/dist"

find $DIST_DIR -type f -delete

# Build each module type
for target in esm cjs
do
    echo "Building ${target} module"

    tsc -p tsconfig.${target}.json
done
