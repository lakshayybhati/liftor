#!/bin/sh
# Usage: DS_KEY=... GEM_KEY=... ./set-deepseek-env.sh

set -e

ENV=production

if [ -z "$DS_KEY" ]; then
  echo "❌ DS_KEY not provided. Run as: DS_KEY=your_key ./set-deepseek-env.sh"
  exit 1
fi

echo "🚀 Setting DeepSeek as primary in $ENV..."

eas env:create $ENV --name EXPO_PUBLIC_AI_PROVIDER --value deepseek --type string --visibility plaintext --force --non-interactive

eas env:create $ENV --name EXPO_PUBLIC_AI_API_KEY --value "$DS_KEY" --type string --visibility sensitive --force --non-interactive

eas env:create $ENV --name EXPO_PUBLIC_AI_MODEL --value deepseek-chat --type string --visibility plaintext --force --non-interactive

eas env:create $ENV --name EXPO_PUBLIC_ENABLE_FALLBACK --value true --type string --visibility plaintext --force --non-interactive

# Optional Gemini fallback if GEM_KEY is provided
if [ -n "$GEM_KEY" ]; then
  echo "➕ Adding Gemini fallback"
  eas env:create $ENV --name EXPO_PUBLIC_GEMINI_API_KEY --value "$GEM_KEY" --type string --visibility sensitive --force --non-interactive
fi

echo "✅ Done. Current vars:"
eas env:list --environment $ENV
