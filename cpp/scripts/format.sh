#!/usr/bin/env bash

set -eu
set -o pipefail

: '

Runs clang-format on C++ source code

Return `1` if there are files to be formatted, and automatically formats them.

Returns `0` if everything looks properly formatted.

'

# Run clang-format on all cpp and hpp files
find include/ src/ test/ -type f -name '*.hpp' -or -name '*.cpp' \
 | xargs -I{} clang-format -i -style=file {}

# Print list of modified files
dirty=$(git ls-files --modified include/ src/ test/)

if [[ $dirty ]]; then
    echo "The following files have been modified:"
    echo $dirty
    exit 1
else
    exit 0
fi
