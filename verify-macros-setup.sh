#!/bin/bash

# Verify macros function setup for snap food feature
echo "🔍 Verifying Macros Function Setup..."
echo "======================================"

# Check if required environment variables are set locally
echo ""
echo "1. Checking local environment variables..."

check_var() {
    if [ -z "${!1}" ]; then
        echo "   ❌ $1 is not set"
        return 1
    else
        echo "   ✅ $1 is set"
        return 0
    fi
}

all_set=true

check_var "SUPABASE_URL" || all_set=false
check_var "SUPABASE_ANON_KEY" || all_set=false
check_var "DEEPSEEK_API_KEY" || all_set=false
check_var "GEMINI_API_KEY" || all_set=false

echo ""
echo "2. Checking Supabase Edge Function secrets..."
echo "   Run the following command to verify secrets are set:"
echo ""
echo "   supabase secrets list"
echo ""
echo "   Required secrets:"
echo "   - DEEPSEEK_API_KEY (for manual text entry)"
echo "   - GEMINI_API_KEY (for image analysis)"
echo "   - TZ_LOCAL (optional, defaults to Asia/Kolkata)"

echo ""
echo "3. To set missing secrets, run:"
echo ""
echo "   supabase secrets set DEEPSEEK_API_KEY='your-key-here'"
echo "   supabase secrets set GEMINI_API_KEY='your-key-here'"
echo "   supabase secrets set TZ_LOCAL='Asia/Kolkata'"

echo ""
echo "4. After setting secrets, deploy the function:"
echo ""
echo "   supabase functions deploy macros"

echo ""
echo "5. Test the function with manual entry:"
echo ""
cat << 'EOF'
curl -i -X POST "$SUPABASE_URL/functions/v1/macros" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "text",
    "name": "paneer tikka",
    "portion": "150 g",
    "previewOnly": true
  }'
EOF

echo ""
echo "======================================"
if [ "$all_set" = true ]; then
    echo "✅ Local environment variables are configured"
else
    echo "⚠️  Some environment variables are missing locally"
    echo "   Set them in your .env file or export them in your shell"
fi

echo ""
echo "📝 Note: The function needs API keys set as Supabase secrets,"
echo "   not just local environment variables."


