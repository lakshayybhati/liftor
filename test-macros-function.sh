#!/bin/bash

# Test script for debugging macros function 502 error
echo "🧪 Testing Macros Function for Snap Food Feature"
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check required environment variables
check_env() {
    echo ""
    echo "📋 Checking environment variables..."
    
    if [ -z "$SUPABASE_URL" ]; then
        echo -e "${RED}❌ SUPABASE_URL not set${NC}"
        echo "   Please set: export SUPABASE_URL='your-project-url'"
        exit 1
    else
        echo -e "${GREEN}✅ SUPABASE_URL set${NC}"
    fi
    
    if [ -z "$SUPABASE_ANON_KEY" ]; then
        echo -e "${RED}❌ SUPABASE_ANON_KEY not set${NC}"
        echo "   Please set: export SUPABASE_ANON_KEY='your-anon-key'"
        exit 1
    else
        echo -e "${GREEN}✅ SUPABASE_ANON_KEY set${NC}"
    fi
}

# Test manual text entry (uses DeepSeek)
test_manual_entry() {
    echo ""
    echo "🔤 Testing manual text entry (DeepSeek)..."
    echo "----------------------------------------"
    
    # Edge Functions require BOTH Authorization and apikey headers
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/functions/v1/macros" \
        -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "kind": "text",
            "name": "chicken breast",
            "portion": "100g",
            "previewOnly": true
        }')
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    echo "HTTP Status: $HTTP_CODE"
    
    # Special handling for 401 errors (common authentication issue)
    if [ "$HTTP_CODE" = "401" ]; then
        echo -e "${RED}❌ Authentication Error (401 Invalid JWT)${NC}"
        echo ""
        echo "Response:"
        echo "$BODY"
        echo ""
        echo -e "${YELLOW}🔍 Common Causes:${NC}"
        echo "1. You're using the SERVICE ROLE KEY (starts with sbp_...) instead of ANON KEY"
        echo "2. Your ANON KEY is incorrect or expired"
        echo "3. Missing the 'apikey' header"
        echo ""
        echo -e "${GREEN}✅ Solution:${NC}"
        echo "Get your ANON KEY from: Supabase Dashboard → Settings → API → Project API keys → 'anon public'"
        echo "It should start with: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        echo ""
        echo "Then set it and try again:"
        echo "  export SUPABASE_ANON_KEY='eyJ...'"
        return 1
    fi
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✅ Manual entry test PASSED${NC}"
        echo "Response body:"
        echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
    else
        echo -e "${RED}❌ Manual entry test FAILED${NC}"
        echo "Error response:"
        echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
        
        # Parse error code if available
        ERROR_CODE=$(echo "$BODY" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('code', 'Unknown'))" 2>/dev/null)
        ERROR_MSG=$(echo "$BODY" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('message', 'Unknown'))" 2>/dev/null)
        
        echo ""
        echo "Error Analysis:"
        case "$ERROR_CODE" in
            "INTERNAL")
                if [[ "$ERROR_MSG" == *"DeepSeek API key"* ]]; then
                    echo -e "${YELLOW}⚠️  DeepSeek API key not configured in Supabase${NC}"
                    echo "   Fix: supabase secrets set DEEPSEEK_API_KEY='your-key'"
                else
                    echo -e "${YELLOW}⚠️  Internal server error${NC}"
                    echo "   Check function logs: supabase functions logs macros"
                fi
                ;;
            "UNAUTHORIZED")
                echo -e "${YELLOW}⚠️  Authentication issue${NC}"
                echo "   Ensure you're using the correct ANON KEY (starts with eyJ...)"
                echo "   NOT the service role key (starts with sbp_...)"
                ;;
            "BAD_INPUT")
                echo -e "${YELLOW}⚠️  Invalid request format${NC}"
                ;;
            "401")
                echo -e "${YELLOW}⚠️  Invalid JWT / Authentication Error${NC}"
                echo "   You're likely using the wrong key type:"
                echo "   - Use ANON KEY (starts with eyJ...) from Supabase Dashboard → Settings → API"
                echo "   - NOT the service role key (starts with sbp_...)"
                echo "   - Edge Functions require BOTH headers:"
                echo "     -H 'Authorization: Bearer \$SUPABASE_ANON_KEY'"
                echo "     -H 'apikey: \$SUPABASE_ANON_KEY'"
                ;;
            *)
                echo -e "${YELLOW}⚠️  Error code: $ERROR_CODE${NC}"
                echo "   Message: $ERROR_MSG"
                ;;
        esac
    fi
}

# Test with authentication token (simulating logged-in user)
test_with_auth() {
    echo ""
    echo "🔐 Testing with user authentication..."
    echo "----------------------------------------"
    echo "Note: This requires a valid user session token"
    echo "You can get one from your app's authentication flow"
    echo ""
    echo "To test with auth, run:"
    echo 'curl -X POST "$SUPABASE_URL/functions/v1/macros" \'
    echo '  -H "Authorization: Bearer YOUR_USER_ACCESS_TOKEN" \'
    echo '  -H "Content-Type: application/json" \'
    echo '  -d '"'"'{"kind":"text","name":"rice","portion":"1 cup","previewOnly":true}'"'"
}

# Show deployment instructions
show_deployment_info() {
    echo ""
    echo "📦 Deployment Instructions"
    echo "----------------------------------------"
    echo "1. Ensure secrets are set in Supabase:"
    echo "   supabase secrets set DEEPSEEK_API_KEY='your-key'"
    echo "   supabase secrets set GEMINI_API_KEY='your-key'"
    echo ""
    echo "2. Deploy the function:"
    echo "   supabase functions deploy macros"
    echo ""
    echo "3. Check function logs for errors:"
    echo "   supabase functions logs macros"
}

# Main execution
check_env
test_manual_entry
test_with_auth
show_deployment_info

echo ""
echo "================================================="
echo "Test complete. Check the results above for issues."
