export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  completion: string;
}

type AIProvider = 'gemini' | 'openai' | 'deepseek' | 'rork';

// Use centralized production configuration
import { getProductionConfig, logProductionMetric } from '@/utils/production-config';

// --- Performance helpers ----------------------------------------------------
function compactText(input: string, maxLength: number): string {
  const normalized = input
    .replace(/\s+/g, ' ')
    .replace(/\s([,.!?:;])/g, '$1')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  // Keep the last part (often contains the concrete JSON/template)
  return normalized.slice(Math.max(0, normalized.length - maxLength));
}

function optimizeMessages(messages: Message[]): Message[] {
  const content = messages.map(m => m.content).join(' ').toLowerCase();
  
  // Detect base plan generation (needs full prompts)
  const isBasePlan = content.includes('seven') || content.includes('7-day') || 
                     content.includes('weekly') || content.includes('monday') && content.includes('sunday');
  
  if (isBasePlan) {
    // Don't truncate for base plan generation - need full context
    return messages;
  }
  
  // Limit system to 2000 chars, user to 6000 chars; others to 2000 for daily adjustments
  const limits = { system: 2000, user: 6000, assistant: 2000 } as const;
  return messages.map(m => ({
    role: m.role,
    content: compactText(m.content || '', limits[m.role])
  }));
}

function estimateMaxTokens(messages: Message[]): number {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const content = messages.map(m => m.content).join(' ').toLowerCase();
  
  // Detect base plan generation (needs more tokens for full week)
  const isBasePlan = content.includes('seven') || content.includes('7-day') || 
                     content.includes('weekly') || content.includes('monday') && content.includes('sunday');
  
  if (isBasePlan) {
    return 8192; // Significantly increased for full 7-day plans
  }
  
  // Approximate 4 chars ≈ 1 token; cap to keep responses short and fast for daily adjustments
  const approxTokens = Math.ceil(totalChars / 4);
  if (approxTokens < 600) return 1024;
  if (approxTokens < 2000) return 2048;
  return 4096;
}

/**
 * Universal AI client that routes to the configured provider with fallback
 */
export async function generateAICompletion(messages: Message[]): Promise<AIResponse> {
  const config = getProductionConfig();
  const optimizedMessages = optimizeMessages(messages);
  
  // Smart provider detection: Force DeepSeek when available; otherwise explicit provider or Rork
  const hasDeepSeekKey = !!config.aiApiKey;
  const hasGeminiKey = !!config.geminiApiKey;
  
  // Prefer DeepSeek unless provider is explicitly set to another value and DeepSeek key is missing
  const provider = (
    hasDeepSeekKey ? 'deepseek' : (config.aiProvider || (hasGeminiKey ? 'gemini' : 'rork'))
  ) as AIProvider;
  
  const enableFallback = config.enableFallback;

  console.log(`🤖 [AI Client] Using provider: ${provider}`);
  console.log(`🔑 [AI Client] DeepSeek key: ${hasDeepSeekKey ? '✅' : '❌'}`);
  console.log(`🔑 [AI Client] Gemini key: ${hasGeminiKey ? '✅' : '❌'}`);
  console.log(`🔄 [AI Client] Fallback enabled: ${enableFallback}`);
  
  if (config.isProduction) {
    logProductionMetric('api', 'ai_request_start', { provider });
  }

  try {
    switch (provider) {
      case 'deepseek':
        return await generateWithDeepSeek(optimizedMessages);
      case 'gemini':
        return await generateWithGemini(optimizedMessages);
      case 'openai':
        return await generateWithOpenAI(optimizedMessages);
      case 'rork':
      default:
        return await generateWithRork(optimizedMessages);
    }
  } catch (error) {
    console.error(`❌ [AI Client] ${provider} failed:`, error);
    
    // Better error logging
    const errorDetails = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack?.substring(0, 500) }
      : error;
    console.error('❌ [AI Client] Error details:', errorDetails);

    const isDev = __DEV__;
    
    // Intelligent fallback chain: Prefer fast fallback on timeout
    if (enableFallback || !isDev) {
      const message = (error as Error)?.message?.toLowerCase() || '';
      const isTimeout = message.includes('timeout');

      // If DeepSeek timed out, try fast Rork first to reduce latency, then Gemini
      if (provider === 'deepseek' && isTimeout) {
        console.log('🔄 [AI Client] DeepSeek timeout, attempting fast Rork fallback...');
        try {
          return await generateWithRork(optimizedMessages);
        } catch (rorkError) {
          console.error('❌ [AI Client] Rork fast fallback failed:', rorkError);
          if (hasGeminiKey) {
            try {
              console.log('🔄 [AI Client] Trying Gemini after Rork failure...');
              return await generateWithGemini(optimizedMessages);
            } catch (geminiError) {
              console.error('❌ [AI Client] Gemini fallback also failed:', geminiError);
            }
          }
        }
      }

      // DeepSeek failed → try Gemini
      if (provider === 'deepseek' && hasGeminiKey) {
        console.log('🔄 [AI Client] DeepSeek failed, attempting Gemini fallback...');
        try {
          return await generateWithGemini(optimizedMessages);
        } catch (geminiError) {
          console.error('❌ [AI Client] Gemini fallback failed:', geminiError);
          // Continue to Rork fallback
        }
      }
      
      // Gemini failed (or DeepSeek→Gemini failed) → try Rork
      if (provider === 'gemini' || provider === 'deepseek') {
        console.log('🔄 [AI Client] Attempting Rork toolkit fallback...');
        try {
          return await generateWithRork(optimizedMessages);
        } catch (rorkError) {
          console.error('❌ [AI Client] Rork fallback also failed:', rorkError);
          throw error; // Return original error
        }
      }
      
      // OpenAI failed → try Rork
      if (provider === 'openai') {
        console.log('🔄 [AI Client] Attempting Rork toolkit fallback...');
        try {
          return await generateWithRork(optimizedMessages);
        } catch (rorkError) {
          console.error('❌ [AI Client] Rork fallback also failed:', rorkError);
          throw error;
        }
      }
    }

    throw error;
  }
}

/**
 * Google Gemini API implementation
 */
async function generateWithGemini(messages: Message[]): Promise<AIResponse> {
  const config = getProductionConfig();
  // Require explicit Gemini key to avoid accidental use via generic AI key
  const apiKey = config.geminiApiKey;
  const optimized = optimizeMessages(messages);
  const maxTokens = estimateMaxTokens(optimized);
  // Normalize Gemini model names to v1 listable variants
  const normalizeGeminiModel = (m: string | undefined) => {
    // If model is not a Gemini model string, force a safe default
    if (!m || !/^gemini-/i.test(m)) return 'gemini-1.5-flash-latest';
    // Map common aliases to -latest
    if (/^gemini-1\.5-flash$/i.test(m)) return 'gemini-1.5-flash-latest';
    if (/^gemini-1\.5-pro$/i.test(m)) return 'gemini-1.5-pro-latest';
    return m;
  };
  const model = normalizeGeminiModel(config.aiModel) || 'gemini-1.5-flash-latest';

  if (!apiKey) {
    console.error('❌ [Gemini] No API key found');
    console.error('Checked for:', [
      'extra.EXPO_PUBLIC_AI_API_KEY',
      'extra.EXPO_PUBLIC_GEMINI_API_KEY'
    ]);
    throw new Error('Gemini API key is not configured. Please set EXPO_PUBLIC_GEMINI_API_KEY in EAS secrets.');
  }

  // Combine system and user messages for Gemini
  const systemMessage = optimized.find(m => m.role === 'system')?.content || '';
  const userMessage = optimized.find(m => m.role === 'user')?.content || '';
  const combinedPrompt = systemMessage ? `${systemMessage}\n\n${userMessage}` : userMessage;

  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  console.log('🤖 [Gemini] Calling API...');
  console.log('[Gemini] Model:', model);
  console.log('[Gemini] Prompt length:', combinedPrompt.length);
  console.log('[Gemini] API key prefix:', apiKey.substring(0, 10) + '...');

  // Add timeout for production reliability (45 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error('❌ [Gemini] Request timeout after 45s');
    controller.abort();
  }, 45000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: combinedPrompt }]
        }],
        generationConfig: {
          temperature: 0.6,
          topK: 40,
          topP: 0.9,
          maxOutputTokens: maxTokens,
        },
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Gemini] API Error:', response.status);
      console.error('[Gemini] Error response:', errorText.substring(0, 500));
      
      // Provide more specific error messages
      if (response.status === 403 || errorText.includes('API_KEY_INVALID')) {
        throw new Error('Invalid Gemini API key. Please check your API key configuration.');
      } else if (response.status === 429 || errorText.includes('quota')) {
        throw new Error('Gemini API quota exceeded. Please check your API usage.');
      } else if (response.status === 400) {
        throw new Error('Invalid request to Gemini API. Please check the prompt format.');
      } else if (response.status === 404 && /not found|not supported/i.test(errorText)) {
        // Retry once with -latest variant if not already using it
        const fallbackModel = normalizeGeminiModel(model);
        if (fallbackModel !== model) {
          console.log('[Gemini] Retrying with model:', fallbackModel);
          const retryUrl = `https://generativelanguage.googleapis.com/v1/models/${fallbackModel}:generateContent?key=${apiKey}`;
          const retry = await fetch(retryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
              generationConfig: {
                temperature: 0.6,
                topK: 40,
                topP: 0.9,
                maxOutputTokens: maxTokens,
              },
            }),
            signal: controller.signal,
          });
          if (retry.ok) {
            const data2 = await retry.json();
            const completion2 = data2?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!completion2) throw new Error('Invalid response structure from Gemini');
            console.log('✅ [Gemini] Response received on retry with -latest, length:', completion2.length);
            return { completion: completion2 };
          }
        }
      }
      
      throw new Error(`Gemini API failed: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const completion = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!completion) {
      throw new Error('Invalid response structure from Gemini');
    }

    console.log('✅ [Gemini] Response received, length:', completion.length);
    return { completion };
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle abort/timeout
    if ((error as Error).name === 'AbortError') {
      throw new Error('Gemini API request timeout. Please try again.');
    }
    
    throw error;
  }
}

/**
 * OpenAI GPT API implementation
 */
async function generateWithOpenAI(messages: Message[]): Promise<AIResponse> {
  const config = getProductionConfig();
  const optimized = optimizeMessages(messages);
  const apiKey = config.aiApiKey;
  const model = config.aiModel || 'gpt-4o-mini';
  const maxTokens = estimateMaxTokens(optimized);

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
      messages: optimized.map(m => ({ role: m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant', content: m.content })),
      temperature: 0.6,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OpenAI API Error:', response.status, errorText);
    throw new Error(`OpenAI API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const completion = data?.choices?.[0]?.message?.content;
  if (!completion) {
    throw new Error('Invalid response structure from OpenAI');
  }

  console.log('✅ OpenAI response received, length:', completion.length);
  return { completion };
}

/**
 * DeepSeek API implementation
 */
async function generateWithDeepSeek(messages: Message[]): Promise<AIResponse> {
  const config = getProductionConfig();
  const optimized = optimizeMessages(messages);
  const apiKey = config.aiApiKey;
  
  // Ensure we use a valid DeepSeek model
  const model = (config.aiProvider === 'deepseek' && config.aiModel?.startsWith('deepseek'))
    ? config.aiModel
    : 'deepseek-chat';

  if (!apiKey) {
    console.error('❌ [DeepSeek] No API key found');
    throw new Error('DeepSeek API key is not configured. Please set EXPO_PUBLIC_AI_API_KEY in EAS secrets.');
  }

  const url = 'https://api.deepseek.com/v1/chat/completions';

  console.log('🤖 [DeepSeek] Calling API...');
  console.log('[DeepSeek] Model:', model);
  console.log('[DeepSeek] Messages count:', messages.length);
  console.log('[DeepSeek] API key prefix:', apiKey.substring(0, 10) + '...');

  // Add timeout for production reliability; read from production config with 600s default (increased from 300s)
  const controller = new AbortController();
  // Use 10 minutes as default to prevent premature timeouts during two-stage generation
  const timeoutMs = Math.max(600000, config.aiTimeoutMs || 600000);
  console.log(`⏱️ [DeepSeek] Timeout set to ${Math.round(timeoutMs/1000)}s`);
  const timeoutId = setTimeout(() => {
    console.warn(`⚠️ [DeepSeek] Request timeout after ${Math.round(timeoutMs/1000)}s - switching to fallback`);
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: optimized.map(m => ({ 
          role: m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant', 
          content: m.content 
        })),
        temperature: 0.6,
        max_tokens: estimateMaxTokens(optimized),
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [DeepSeek] API Error:', response.status);
      console.error('[DeepSeek] Error response:', errorText.substring(0, 500));
      
      // Provide more specific error messages
      if (response.status === 401 || errorText.includes('invalid_api_key')) {
        throw new Error('Invalid DeepSeek API key. Please check your API key configuration.');
      } else if (response.status === 429 || errorText.includes('rate_limit')) {
        throw new Error('DeepSeek API rate limit exceeded. Please try again later.');
      } else if (response.status === 402 || errorText.includes('insufficient_quota')) {
        throw new Error('DeepSeek API quota exceeded. Please top up your account.');
      } else if (response.status === 400) {
        throw new Error('Invalid request to DeepSeek API. Please check the prompt format.');
      }
      
      throw new Error(`DeepSeek API failed: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const completion = data?.choices?.[0]?.message?.content;
    if (!completion) {
      throw new Error('Invalid response structure from DeepSeek');
    }

    console.log('✅ [DeepSeek] Response received, length:', completion.length);
    return { completion };
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle abort/timeout
    if ((error as Error).name === 'AbortError') {
      throw new Error('DeepSeek API request timeout. Please try again.');
    }
    
    throw error;
  }
}

/**
 * Rork Toolkit (current dev fallback)
 */
async function generateWithRork(messages: Message[]): Promise<AIResponse> {
  console.log('🤖 [Rork] Calling Toolkit API (fallback)...');
  console.log('[Rork] Messages count:', messages.length);

  // Add timeout for production reliability (60 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error('❌ [Rork] Request timeout after 60s');
    controller.abort();
  }, 60000);

  try {
    const response = await fetch('https://toolkit.rork.com/text/llm/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Rork] API Error:', response.status);
      console.error('[Rork] Error response:', errorText.substring(0, 500));
      throw new Error(`Rork API failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.completion) {
      throw new Error('No completion in Rork API response');
    }

    console.log('✅ [Rork] Response received, length:', data.completion.length);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle abort/timeout
    if ((error as Error).name === 'AbortError') {
      throw new Error('Rork API request timeout. Please try again.');
    }
    
    throw error;
  }
}


