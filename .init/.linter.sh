#!/bin/bash
cd /home/kavia/workspace/code-generation/music-streamer-platform-297904-297914/backend_fastapi
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

