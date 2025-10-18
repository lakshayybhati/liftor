# Custom AI API Integration Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Environment Setup](#environment-setup)
4. [API Provider Integration](#api-provider-integration)
5. [Implementation Guide](#implementation-guide)
6. [Error Handling & Fallbacks](#error-handling--fallbacks)
7. [Testing & Validation](#testing--validation)
8. [Production Deployment](#production-deployment)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

This guide explains how to integrate custom AI APIs (Google Gemini, DeepSeek, OpenAI, etc.) into your FitCoach app for production use. The app currently uses `toolkit.rork.com` for development, but you can switch to direct API access for better control, reliability, and scalability.

### Current AI Usage in the App

The app uses AI in two critical places:

1. **Base Plan Generation** (`app/generating-base-plan.tsx`)
   - Creates a 7-day weekly workout and nutrition template
   - Runs once during onboarding or when user updates preferences
   - Input: Complete user profile (goals, equipment, diet, preferences)
   - Output: 7-day structured plan with workouts, meals, and recovery

2. **Daily Plan Adjustment** (`app/generating-plan.tsx`)
   - Adapts today's plan based on daily check-in data
   - Runs every morning after user completes check-in
   - Input: Today's check-in + recent history + base plan
   - Output: Personalized daily plan adjusted for energy, stress, soreness

---

## 🚀 Quick Start

### Step 1: Choose Your AI Provider

**Recommended for Production: Google Gemini**
- ✅ Best cost-to-performance ratio (~$0.008/user/month)
- ✅ Fast response times (2-4 seconds)
- ✅ Reliable JSON output
- ✅ High rate limits on paid tier

**Alternative Options:**
- **DeepSeek**: Very cost-effective (~$0.031/user/month), good for budget-conscious apps
- **OpenAI GPT-4**: Most powerful but expensive (~$0.93/user/month)
- **Anthropic Claude**: Great for complex reasoning, moderate cost

### Step 2: Get Your API Key

**For Google Gemini:**
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key (starts with `AIzaSy...`)

**For DeepSeek:**
1. Visit [DeepSeek Platform](https://platform.deepseek.com/)
2. Sign up and verify your account
3. Navigate to API Keys section
4. Generate a new key

**For OpenAI:**
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-...`)

### Step 3: Set Up Environment Variables

Create or update your `.env` file in the project root:

```bash
# Existing Supabase config
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# AI Provider Configuration
EXPO_PUBLIC_AI_PROVIDER=gemini
EXPO_PUBLIC_AI_API_KEY=AIzaSy...your-key-here
EXPO_PUBLIC_AI_MODEL=gemini-2.0-flash-exp

# Optional: Fallback Configuration
EXPO_PUBLIC_ENABLE_FALLBACK=true
```

**⚠️ CRITICAL SECURITY NOTE:**
- Never commit `.env` to version control
- The `.gitignore` already includes `.env` - verify this
- For production, use environment variables in your deployment platform

---

## 🔧 Environment Setup

### 1. Verify .gitignore

Ensure your `.gitignore` includes:

```
.env
.env.local
.env.production
.env.*.local
```

### 2. Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `EXPO_PUBLIC_AI_PROVIDER` | Yes | AI provider to use | `gemini`, `openai`, `deepseek`, `rork` |
| `EXPO_PUBLIC_AI_API_KEY` | Yes* | Your API key | `AIzaSy...` (Gemini) or `sk-...` (OpenAI) |
| `EXPO_PUBLIC_AI_MODEL` | No | Model name | `gemini-2.0-flash-exp` |
| `EXPO_PUBLIC_ENABLE_FALLBACK` | No | Enable fallback to Rork | `true` or `false` |

*Not required if using `rork` provider

### 3. Development vs Production

**Development (.env.development):**
```bash
EXPO_PUBLIC_AI_PROVIDER=rork
# No API key needed - uses free tier
```

**Production (.env.production):**
```bash
EXPO_PUBLIC_AI_PROVIDER=gemini
EXPO_PUBLIC_AI_API_KEY=your-production-key
EXPO_PUBLIC_AI_MODEL=gemini-2.0-flash-exp
EXPO_PUBLIC_ENABLE_FALLBACK=true
```

---

## 🔌 API Provider Integration

### Create AI Client Utility

Create a new file: `utils/ai-client.ts`

```typescript
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIResponse {
  completion: string;
}

type AIProvider = 'gemini' | 'openai' | 'deepseek' | 'rork';

/**
 * Universal AI client that routes to the configured provider
 */
export async function generateAICompletion(messages: Message[]): Promise<AIResponse> {
  const provider = (process.env.EXPO_PUBLIC_AI_PROVIDER || 'rork') as AIProvider;
  
  console.log(`🤖 Using AI provider: ${provider}`);

  try {
    switch (provider) {
      case 'gemini':
        return await generateWithGemini(messages);
      case 'openai':
        return await generateWithOpenAI(messages);
      case 'deepseek':
        return await generateWithDeepSeek(messages);
      case 'rork':
      default:
        return await generateWithRork(messages);
    }
  } catch (error) {
    console.error(`❌ ${provider} failed:`, error);
    
    // Fallback to Rork if enabled and not already using it
    if (provider !== 'rork' && process.env.EXPO_PUBLIC_ENABLE_FALLBACK === 'true') {
      console.log('🔄 Falling back to Rork toolkit...');
      return await generateWithRork(messages);
    }
    
    throw error;
  }
}

/**
 * Google Gemini API implementation
 */
async function generateWithGemini(messages: Message[]): Promise<AIResponse> {
  const apiKey = process.env.EXPO_PUBLIC_AI_API_KEY;
  const model = process.env.EXPO_PUBLIC_AI_MODEL || 'gemini-2.0-flash-exp';
  
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_AI_API_KEY is not set');
  }

  // Combine system and user messages for Gemini
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const userMessage = messages.find(m => m.role === 'user')?.content || '';
  const combinedPrompt = systemMessage ? `${systemMessage}\n\n${userMessage}` : userMessage;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  console.log('🤖 Calling Gemini API...');
  console.log('Model:', model);
  console.log('Prompt length:', combinedPrompt.length);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: combinedPrompt
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Gemini API Error:', response.status, errorText);
    throw new Error(`Gemini API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('Invalid response structure from Gemini');
  }

  const completion = data.candidates[0].content.parts[0].text;
  console.log('✅ Gemini response received, length:', completion.length);

  return { completion };
}

/**
 * OpenAI GPT API implementation
 */
async function generateWithOpenAI(messages: Message[]): Promise<AIResponse> {
  const apiKey = process.env.EXPO_PUBLIC_AI_API_KEY;
  const model = process.env.EXPO_PUBLIC_AI_MODEL || 'gpt-4-turbo-preview';
  
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_AI_API_KEY is not set');
  }

  const url = 'https://api.openai.com/v1/chat/completions';

  console.log('🤖 Calling OpenAI API...');
  console.log('Model:', model);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OpenAI API Error:', response.status, errorText);
    throw new Error(`OpenAI API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('Invalid response structure from OpenAI');
  }

  const completion = data.choices[0].message.content;
  console.log('✅ OpenAI response received, length:', completion.length);

  return { completion };
}

/**
 * DeepSeek API implementation
 */
async function generateWithDeepSeek(messages: Message[]): Promise<AIResponse> {
  const apiKey = process.env.EXPO_PUBLIC_AI_API_KEY;
  const model = process.env.EXPO_PUBLIC_AI_MODEL || 'deepseek-chat';
  
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_AI_API_KEY is not set');
  }

  const url = 'https://api.deepseek.com/v1/chat/completions';

  console.log('🤖 Calling DeepSeek API...');
  console.log('Model:', model);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ DeepSeek API Error:', response.status, errorText);
    throw new Error(`DeepSeek API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('Invalid response structure from DeepSeek');
  }

  const completion = data.choices[0].message.content;
  console.log('✅ DeepSeek response received, length:', completion.length);

  return { completion };
}

/**
 * Rork Toolkit (current implementation - free tier)
 */
async function generateWithRork(messages: Message[]): Promise<AIResponse> {
  console.log('🤖 Calling Rork Toolkit API...');
  
  const response = await fetch('https://toolkit.rork.com/text/llm/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Rork API Error:', response.status, errorText);
    throw new Error(`Rork API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.completion) {
    throw new Error('No completion in Rork API response');
  }

  console.log('✅ Rork response received, length:', data.completion.length);
  
  return data;
}
```

---

## 📝 Implementation Guide

### Step 1: Update Plan Generation Files

You need to update two files to use the new AI client:

#### 1. Update `app/generating-plan.tsx`

Find this code (around line 110):

```typescript
const response = await fetch('https://toolkit.rork.com/text/llm/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(requestBody),
});

if (!response.ok) {
  const errorText = await response.text();
  console.error('❌ API Error:', response.status, errorText);
  throw new Error(`API request failed: ${response.status} - ${errorText}`);
}

const data = await response.json();
```

Replace it with:

```typescript
import { generateAICompletion } from '@/utils/ai-client';

// Replace the fetch call with:
const data = await generateAICompletion(requestBody.messages);
```

#### 2. Update `app/generating-base-plan.tsx`

Find this code (around line 179):

```typescript
const response = await fetch('https://toolkit.rork.com/text/llm/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(requestBody),
});

if (!response.ok) {
  const errorText = await response.text();
  console.error('❌ API Error:', response.status, errorText);
  throw new Error(`API request failed: ${response.status} - ${errorText}`);
}

const data = await response.json();
```

Replace it with:

```typescript
import { generateAICompletion } from '@/utils/ai-client';

// Replace the fetch call with:
const data = await generateAICompletion(requestBody.messages);
```

### Step 2: Test the Integration

After making these changes:

1. **Restart your development server:**
   ```bash
   npm start -- --clear
   ```

2. **Test with Rork first** (no API key needed):
   ```bash
   # In .env
   EXPO_PUBLIC_AI_PROVIDER=rork
   ```

3. **Then test with your chosen provider:**
   ```bash
   # In .env
   EXPO_PUBLIC_AI_PROVIDER=gemini
   EXPO_PUBLIC_AI_API_KEY=your-key-here
   ```

4. **Complete the onboarding flow** to test base plan generation

5. **Complete a daily check-in** to test daily plan adjustment

---

## 🛡️ Error Handling & Fallbacks

The app has **three layers of protection** to ensure it never breaks:

### Layer 1: API Error Handling

The AI client automatically handles:
- Network failures
- API rate limits
- Invalid API keys
- Timeout errors

```typescript
try {
  const data = await generateAICompletion(messages);
} catch (apiError) {
  console.error('❌ API Error:', apiError);
  // Falls through to Layer 2 (fallback provider)
}
```

### Layer 2: Provider Fallback

If your primary provider fails and `EXPO_PUBLIC_ENABLE_FALLBACK=true`:

```typescript
// Automatically falls back to Rork toolkit
if (provider !== 'rork' && process.env.EXPO_PUBLIC_ENABLE_FALLBACK === 'true') {
  console.log('🔄 Falling back to Rork toolkit...');
  return await generateWithRork(messages);
}
```

### Layer 3: Adaptive Fallback Plans

If all AI providers fail, the app generates an **intelligent fallback plan** based on user data:

**The fallback is NOT a generic template. It:**
- ✅ Uses only user's available equipment
- ✅ Respects dietary preferences (vegetarian, eggitarian, non-veg)
- ✅ Adjusts intensity based on energy levels
- ✅ Includes preferred exercises
- ✅ Avoids exercises user wants to skip
- ✅ Considers injuries and limitations
- ✅ Matches user's fitness goals

**Example:** If user has only bodyweight equipment and is vegetarian with low energy:
- Workout: Gentle bodyweight exercises (no gym equipment)
- Nutrition: Plant-based meals only
- Intensity: Reduced volume, higher RIR
- Recovery: Emphasized mobility and rest

This is already implemented in both `generating-plan.tsx` and `generating-base-plan.tsx` in the catch blocks.

---

## 🧪 Testing & Validation

### Pre-Production Testing Checklist

#### 1. API Connection Test

Create `utils/test-ai.ts`:

```typescript
import { generateAICompletion } from './ai-client';

export async function testAIConnection() {
  console.log('🧪 Testing AI connection...');
  
  try {
    const response = await generateAICompletion([
      {
        role: 'system',
        content: 'You are a helpful assistant. Respond with a simple JSON: {"status": "ok", "message": "Connection successful"}'
      },
      {
        role: 'user',
        content: 'Test connection'
      }
    ]);
    
    console.log('✅ AI connection successful');
    console.log('Response preview:', response.completion.substring(0, 200));
    return true;
  } catch (error) {
    console.error('❌ AI connection failed:', error);
    return false;
  }
}
```

Run in your app (e.g., in `app/index.tsx`):

```typescript
import { testAIConnection } from '@/utils/test-ai';

useEffect(() => {
  if (__DEV__) {
    testAIConnection();
  }
}, []);
```

#### 2. Test Different Scenarios

**Test with valid API key:**
```bash
EXPO_PUBLIC_AI_PROVIDER=gemini
EXPO_PUBLIC_AI_API_KEY=your-valid-key
```

**Test with invalid API key (should fallback):**
```bash
EXPO_PUBLIC_AI_PROVIDER=gemini
EXPO_PUBLIC_AI_API_KEY=invalid-key
EXPO_PUBLIC_ENABLE_FALLBACK=true
```

**Test without API key (should use Rork):**
```bash
EXPO_PUBLIC_AI_PROVIDER=rork
```

#### 3. Monitor Console Logs

Watch for these log messages:

✅ **Success:**
```
🤖 Using AI provider: gemini
🤖 Calling Gemini API...
✅ Gemini response received, length: 4523
✅ Successfully parsed JSON
🎯 Plan generated successfully
```

❌ **Error with fallback:**
```
🤖 Using AI provider: gemini
❌ Gemini API Error: 401 - Invalid API key
🔄 Falling back to Rork toolkit...
✅ Rork response received
```

❌ **Complete failure (uses adaptive fallback):**
```
❌ AI generation failed, using adaptive fallback
🔧 Generated adaptive fallback plan with user preferences
```

#### 4. Test Plan Quality

After generating a plan, verify:
- ✅ Workout exercises match user's equipment
- ✅ Meals match dietary preferences
- ✅ Avoided exercises are not included
- ✅ Preferred exercises are included
- ✅ Session length is respected
- ✅ Meal count matches user preference

---

## 🚀 Production Deployment

### Step 1: Secure Your API Keys

**❌ NEVER do this:**
```typescript
const apiKey = 'AIzaSy...'; // Hard-coded key
```

**✅ ALWAYS do this:**
```typescript
const apiKey = process.env.EXPO_PUBLIC_AI_API_KEY;
```

### Step 2: Environment-Specific Configuration

Create separate environment files:

**`.env.development`:**
```bash
EXPO_PUBLIC_AI_PROVIDER=rork
# Free tier for development
```

**`.env.production`:**
```bash
EXPO_PUBLIC_AI_PROVIDER=gemini
EXPO_PUBLIC_AI_API_KEY=your-production-key
EXPO_PUBLIC_AI_MODEL=gemini-2.0-flash-exp
EXPO_PUBLIC_ENABLE_FALLBACK=true
```

### Step 3: Set Up CI/CD Secrets

**For GitHub Actions:**

1. Go to your repository Settings → Secrets and variables → Actions
2. Add these secrets:
   - `AI_API_KEY`: Your production API key
   - `AI_PROVIDER`: Your chosen provider (e.g., `gemini`)

3. Use in workflow:
```yaml
env:
  EXPO_PUBLIC_AI_API_KEY: ${{ secrets.AI_API_KEY }}
  EXPO_PUBLIC_AI_PROVIDER: ${{ secrets.AI_PROVIDER }}
```

**For Expo EAS:**

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Set secrets
eas secret:create --scope project --name EXPO_PUBLIC_AI_API_KEY --value "your-key"
eas secret:create --scope project --name EXPO_PUBLIC_AI_PROVIDER --value "gemini"
```

### Step 4: Monitor Production Usage

Add logging for production:

```typescript
// utils/logger.ts
export function logAIRequest(provider: string, promptLength: number) {
  if (__DEV__) {
    console.log(`🤖 AI Request: ${provider}, prompt: ${promptLength} chars`);
  } else {
    // Send to analytics (e.g., Firebase, Sentry)
    analytics.logEvent('ai_request', {
      provider,
      promptLength,
      timestamp: new Date().toISOString(),
    });
  }
}

export function logAIError(provider: string, error: Error) {
  if (__DEV__) {
    console.error(`❌ AI Error: ${provider}`, error);
  } else {
    // Send to error tracking
    Sentry.captureException(error, {
      tags: { provider, feature: 'ai_generation' },
    });
  }
}
```

---

## 💰 Cost Estimation

### Typical Usage Per User Per Month

- Base plan generation: 1 request (7-day plan)
- Daily adjustments: 30 requests (1 per day)
- **Total: ~31 requests/month per active user**

### Monthly Costs by Provider

| Provider | Cost per Request | Cost per User/Month | Cost for 1,000 Users |
|----------|------------------|---------------------|----------------------|
| **Gemini 2.0 Flash** | ~$0.00025 | ~$0.008 | ~$8 |
| **DeepSeek** | ~$0.001 | ~$0.031 | ~$31 |
| **GPT-4 Turbo** | ~$0.03 | ~$0.93 | ~$930 |
| **Rork Toolkit** | Free (dev only) | $0 | $0 |

**Recommendation:** Start with Gemini for the best balance of cost, performance, and reliability.

---

## 🔍 Troubleshooting

### Issue 1: "API key not found"

**Symptoms:**
```
Error: EXPO_PUBLIC_AI_API_KEY is not set
```

**Solutions:**
1. Check `.env` file exists in project root
2. Verify key is set: `echo $EXPO_PUBLIC_AI_API_KEY`
3. Restart development server: `npm start -- --clear`
4. Ensure `.env` is not in `.gitignore` (it should be, but needs to exist locally)

### Issue 2: "Invalid JSON response"

**Symptoms:**
```
❌ JSON parsing failed
Failed to parse AI response: Unexpected token
```

**Solutions:**
1. Check console logs for raw AI response
2. Verify prompt is requesting JSON format
3. The app has robust JSON cleaning - check if it's working
4. Try a different model (e.g., `gemini-2.0-flash-exp` instead of `gemini-pro`)

### Issue 3: "Rate limit exceeded"

**Symptoms:**
```
❌ Gemini API Error: 429 - Rate limit exceeded
```

**Solutions:**
1. Enable fallback: `EXPO_PUBLIC_ENABLE_FALLBACK=true`
2. Implement request caching (see below)
3. Upgrade to paid tier for higher limits
4. Switch to provider with higher limits

### Issue 4: "Fallback plan always used"

**Symptoms:**
- AI never generates plans
- Always see "using adaptive fallback" in logs

**Solutions:**
1. Check API key is valid
2. Verify network connectivity
3. Check provider is correctly set in `.env`
4. Review error logs for specific API errors
5. Test API connection with `testAIConnection()`

### Issue 5: "Plans don't match user preferences"

**Symptoms:**
- Workout includes avoided exercises
- Meals don't match dietary preference
- Wrong equipment used

**Solutions:**
1. Verify user profile is complete in `useUserStore`
2. Check console logs show correct user data being sent
3. Review AI prompt in generation files
4. Test with fallback plan (it should respect preferences)

---

## 🎯 Best Practices

### 1. Always Use Environment Variables

```typescript
// ✅ Good
const apiKey = process.env.EXPO_PUBLIC_AI_API_KEY;

// ❌ Bad
const apiKey = 'AIzaSy...';
```

### 2. Enable Fallbacks in Production

```bash
EXPO_PUBLIC_ENABLE_FALLBACK=true
```

### 3. Monitor API Usage

Track:
- Request count per day
- Error rate
- Response times
- Cost per user

### 4. Cache Base Plans

Base plans don't change often - consider caching:

```typescript
// Check if user has a recent base plan (< 7 days old)
const cachedPlan = getCurrentBasePlan();
if (cachedPlan && isRecent(cachedPlan.createdAt, 7)) {
  // Use cached plan instead of generating new one
  return cachedPlan;
}
```

### 5. Test Before Deploying

Always test:
- ✅ Valid API key
- ✅ Invalid API key (fallback)
- ✅ Network failure (fallback)
- ✅ Plan quality (matches user preferences)

---

## 📊 Performance Optimization

### Request Caching

Reduce API calls by caching base plans:

```typescript
// utils/plan-cache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'ai_plan_cache';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getCachedBasePlan(userId: string) {
  try {
    const cached = await AsyncStorage.getItem(`${CACHE_KEY}_${userId}`);
    if (!cached) return null;
    
    const { plan, timestamp } = JSON.parse(cached);
    
    if (Date.now() - timestamp < CACHE_DURATION) {
      console.log('✅ Using cached base plan');
      return plan;
    }
    
    return null;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

export async function setCachedBasePlan(userId: string, plan: any) {
  try {
    await AsyncStorage.setItem(
      `${CACHE_KEY}_${userId}`,
      JSON.stringify({ plan, timestamp: Date.now() })
    );
    console.log('✅ Base plan cached');
  } catch (error) {
    console.error('Cache write error:', error);
  }
}
```

Use in `generating-base-plan.tsx`:

```typescript
// Check cache first
const cachedPlan = await getCachedBasePlan(user.id);
if (cachedPlan) {
  await addBasePlan(cachedPlan);
  router.replace('/plan-preview');
  return;
}

// Generate new plan if not cached
const basePlan = await generateWeeklyBasePlan(user);
await setCachedBasePlan(user.id, basePlan);
```

---

## ✅ Production Checklist

Before deploying to production:

- [ ] API key is stored in environment variables (not hard-coded)
- [ ] `.env` is in `.gitignore`
- [ ] Fallback is enabled (`EXPO_PUBLIC_ENABLE_FALLBACK=true`)
- [ ] Tested with valid API key
- [ ] Tested with invalid API key (fallback works)
- [ ] Tested network failure (fallback works)
- [ ] Verified plans match user preferences
- [ ] Set up error monitoring (Sentry, Firebase, etc.)
- [ ] Set up usage monitoring (analytics)
- [ ] Configured CI/CD secrets
- [ ] Tested production build
- [ ] Documented API key rotation process

---

## 🆘 Support & Resources

### Official Documentation

- **Google Gemini**: https://ai.google.dev/docs
- **OpenAI**: https://platform.openai.com/docs
- **DeepSeek**: https://platform.deepseek.com/docs
- **Expo Environment Variables**: https://docs.expo.dev/guides/environment-variables/

### Common Questions

**Q: Can I use multiple providers?**
A: Yes! Set `EXPO_PUBLIC_ENABLE_FALLBACK=true` and the app will automatically fall back to Rork if your primary provider fails.

**Q: How do I switch providers?**
A: Just change `EXPO_PUBLIC_AI_PROVIDER` in your `.env` file and restart the server.

**Q: Is Rork Toolkit production-ready?**
A: Rork Toolkit is great for development and prototyping. For production, we recommend using direct API access for better control and reliability.

**Q: What happens if AI fails completely?**
A: The app generates an intelligent fallback plan based on user preferences. The app never breaks.

**Q: How do I reduce costs?**
A: Use Gemini (cheapest), enable caching for base plans, and only regenerate plans when user preferences change.

---

## 📝 Summary

### Quick Reference

1. **Choose provider**: Gemini recommended
2. **Get API key**: From provider's platform
3. **Set environment variables**: In `.env` file
4. **Create AI client**: `utils/ai-client.ts`
5. **Update generation files**: Replace fetch calls
6. **Test thoroughly**: Valid key, invalid key, network failure
7. **Deploy securely**: Use CI/CD secrets

### Key Takeaways

- ✅ Current system works (Rork toolkit for development)
- ✅ Switch to direct API for production reliability
- ✅ Gemini recommended (best cost/performance)
- ✅ Fallbacks ensure app never breaks
- ✅ Security first (never commit API keys)
- ✅ Test thoroughly before deploying
- ✅ Monitor usage and costs

---

**Last Updated:** 2025-01-06  
**App Version:** 1.0.0  
**Compatible with:** Expo SDK 53, React Native 0.76
