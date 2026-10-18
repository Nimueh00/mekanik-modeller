#!/bin/zsh
cd "$(dirname "$0")/dizel-motor"
open "http://localhost:5174"
npx vite --port 5174
