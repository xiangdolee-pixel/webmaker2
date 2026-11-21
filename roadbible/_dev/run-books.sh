#!/bin/bash
# 길성경 음성을 책마다 차례로 다시 만들고, 책 하나가 끝날 때마다 배포 · 커밋 · 푸시한다 (2026-11-21 전도서 · 아가 · 모세오경을 새 목소리로, 로마서는 읽는 자리 표시용으로 내 목소리 그대로 다시)
#   bash roadbible/_dev/run-books.sh 전도서/1-12 아가/1-8 …      기록: roadbible/_dev/audio-run.log
cd "$(dirname "$0")/../.." || exit 1
for b in "$@"; do
  echo "=== $(date '+%m-%d %H:%M') 시작 $b"
  FORCE=1 node roadbible/_dev/make-audio.mjs "$b" 2>&1 | grep -v -E "DEP0190|trace-deprecation"
  node deploy.mjs roadbible 2>&1 | tail -3
  git add roadbible/assets/audio roadbible/_dev/audio-jobs-*.json
  git commit -q -m "feat(roadbible): ${b%%/*} 음성 다시 만듦 + 읽는 자리 시각

Co-Authored-By: Claude <noreply@anthropic.com>" -- roadbible/assets/audio roadbible/_dev && git push -q
  echo "=== $(date '+%m-%d %H:%M') 끝 $b"
done
echo "=== 모두 끝"
