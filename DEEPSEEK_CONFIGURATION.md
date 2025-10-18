# DeepSeek AI Configuration Guide

## ✅ Configuration Status

Your app is now configured to use **DeepSeek** as the primary AI provider with automatic fallback to Gemini.

## 🔑 Current Configuration

```bash
EXPO_PUBLIC_AI_PROVIDER=deepseek
EXPO_PUBLIC_AI_API_KEY=sk-da219b7af9a94efaafae5648c8200708
EXPO_PUBLIC_AI_MODEL=deepseek-chat
EXPO_PUBLIC_ENABLE_FALLBACK=true
EXPO_PUBLIC_GEMINI_API_KEY=AIzaSyCu8iT3vj7eKiIB5hhMDoSH1gkgb2zXQks  # Fallback
```

## 🚀 How It Works

### Provider Priority Chain
1. **DeepSeek** (Primary) - Fast, cost-effective, high-quality responses
2. **Gemini** (Fallback) - Automatically used if DeepSeek fails
3. **Rork Toolkit** (Last resort) - Used if both APIs fail

### Smart Key Detection
The app automatically detects which provider to use:
- If `EXPO_PUBLIC_AI_API_KEY` is set → Uses DeepSeek
- If only `EXPO_PUBLIC_GEMINI_API_KEY` is set → Uses Gemini
- If neither is set → Uses Rork Toolkit (free, no key required)

## 📝 Environment Variables

### Required for DeepSeek
```bash
EXPO_PUBLIC_AI_PROVIDER=deepseek          # Sets DeepSeek as primary
EXPO_PUBLIC_AI_API_KEY=sk-xxxxx          # Your DeepSeek API key
EXPO_PUBLIC_AI_MODEL=deepseek-chat       # Model to use
```

### Optional (Recommended for Fallback)
```bash
EXPO_PUBLIC_GEMINI_API_KEY=AIza...       # Gemini fallback key
EXPO_PUBLIC_ENABLE_FALLBACK=true         # Enable automatic fallback
```

## 🔧 Getting a DeepSeek API Key

1. **Sign up** at [https://platform.deepseek.com/](https://platform.deepseek.com/)
2. **Create an API key** in your account dashboard
3. **Copy** the key (starts with `sk-`)
4. **Update** `.env` file:
   ```bash
   EXPO_PUBLIC_AI_API_KEY=sk-your-actual-key-here
   ```
5. **Restart** the development server

## ✨ Benefits of DeepSeek

- **Cost-effective**: Much cheaper than GPT-4 or Gemini
- **Fast**: Quick response times
- **High quality**: Competitive with top-tier models
- **JSON support**: Excellent for structured outputs
- **Context window**: 64K tokens

## 🧪 Testing DeepSeek

### In Development
1. Clear cache: `npx expo start --clear`
2. Look for these logs:
   ```
   🤖 [AI Client] Using provider: deepseek
   🔑 [AI Client] DeepSeek key: ✅
   🤖 [DeepSeek] Calling API...
   ✅ [DeepSeek] Response received
   ```

### Generate a Plan
1. Complete onboarding
2. Click "Generate Plan"
3. Watch the console for DeepSeek logs

## 🐛 Troubleshooting

### Issue: "Invalid DeepSeek API key"
**Solution**: 
- Verify your key starts with `sk-`
- Check for extra spaces or quotes in `.env`
- Get a new key from [platform.deepseek.com](https://platform.deepseek.com/)

### Issue: App still uses Gemini
**Solution**:
```bash
# Clear and restart
npx expo start --clear
```

### Issue: "DeepSeek failed, attempting Gemini fallback"
**Cause**: Normal behavior when:
- API key is invalid
- DeepSeek API is down
- Network issues

**Solution**: 
- Check API key is correct
- Verify network connection
- Wait a moment and retry
- Fallback to Gemini will work automatically

## 📱 Production Deployment

### EAS Build Secrets
When deploying to TestFlight/App Store, set EAS secrets:

```bash
# Set DeepSeek key
eas secret:create --scope project --name EXPO_PUBLIC_AI_API_KEY --value sk-your-key --type string

# Set provider
eas secret:create --scope project --name EXPO_PUBLIC_AI_PROVIDER --value deepseek --type string

# Set model
eas secret:create --scope project --name EXPO_PUBLIC_AI_MODEL --value deepseek-chat --type string
```

### Verify Production Build
After building:
```bash
# Check build logs for:
🤖 [AI Client] Using provider: deepseek
✅ [DeepSeek] API key configured
```

## 🔄 Switching Between Providers

### Use DeepSeek (Current)
```bash
EXPO_PUBLIC_AI_PROVIDER=deepseek
EXPO_PUBLIC_AI_API_KEY=sk-xxxxx
```

### Use Gemini Instead
```bash
EXPO_PUBLIC_AI_PROVIDER=gemini
EXPO_PUBLIC_AI_API_KEY=AIza...   # Use Gemini key
```

### Use OpenAI
```bash
EXPO_PUBLIC_AI_PROVIDER=openai
EXPO_PUBLIC_AI_API_KEY=sk-proj-... # OpenAI key
EXPO_PUBLIC_AI_MODEL=gpt-4o-mini
```

### Use Rork (No Key Required)
```bash
EXPO_PUBLIC_AI_PROVIDER=rork
# No API key needed
```

## 📊 Cost Comparison

| Provider | Input (per 1M tokens) | Output (per 1M tokens) |
|----------|----------------------|------------------------|
| **DeepSeek** | $0.14 | $0.28 |
| Gemini Flash | $0.075 | $0.30 |
| GPT-4o-mini | $0.15 | $0.60 |
| GPT-4 Turbo | $10.00 | $30.00 |

## 🆘 Support

If you encounter issues:
1. Check the logs for error messages
2. Verify `.env` configuration
3. Test with `npx expo start --clear`
4. Check [DeepSeek Status](https://status.deepseek.com/)

---

**Last Updated**: {{ current_date }}
**App Version**: 1.0.0
**DeepSeek Model**: deepseek-chat


