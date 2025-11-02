#!/bin/bash

# Quick test for snap food - USE YOUR ANON KEY, NOT SERVICE ROLE KEY!

echo "🧪 Quick Snap Food Test"
echo "======================="
echo ""

if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ SUPABASE_ANON_KEY is not set!"
    echo ""
    echo "Get your ANON KEY from: Supabase Dashboard → Settings → API → 'anon public'"
    echo "It starts with: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    echo ""
    echo "Then run:"
    echo "  export SUPABASE_ANON_KEY='your-anon-key-here'"
    echo "  ./test-snap-food-quick.sh"
    exit 1
fi

# Check if it looks like an anon key (should start with eyJ)
if [[ ! "$SUPABASE_ANON_KEY" =~ ^eyJ ]]; then
    echo "⚠️  WARNING: Your SUPABASE_ANON_KEY doesn't look like an anon key!"
    echo ""
    echo "Expected: Starts with 'eyJ' (JWT token)"
    echo "Got: Starts with '${SUPABASE_ANON_KEY:0:10}...'"
    echo ""
    if [[ "$SUPABASE_ANON_KEY" =~ ^sbp_ ]]; then
        echo "❌ You're using a SERVICE ROLE KEY (sbp_...) which won't work!"
        echo ""
        echo "You need the ANON KEY from: Supabase Dashboard → Settings → API → 'anon public'"
        exit 1
    fi
    echo "Continuing anyway, but this might fail..."
    echo ""
fi

SUPABASE_URL="https://oyvxcdjvwxchmachnrtb.supabase.co"

echo "Testing manual entry (DeepSeek)..."
echo ""

curl -i -X POST "$SUPABASE_URL/functions/v1/macros" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "text",
    "name": "chicken breast",
    "portion": "100g",
    "previewOnly": true
  }'

echo ""
echo ""
echo "====================================="
echo "If you see HTTP/2 200 ✅ - SUCCESS!"
echo "If you see 401 ❌ - Check your anon key"
echo "If you see 500 with API key error ❌ - Set Supabase secrets"
echo "====================================="


