# 🧠 DeepSeek AI Integration Guide for Liftor (React Native)

## Overview

This guide explains how to integrate **DeepSeek AI** into your **React Native** application — ideal for Liftor’s AI-based calorie recognition, nutrition chat, or reasoning features.

---

## What is DeepSeek AI?

DeepSeek is an **open-source large language model (LLM)** offering:
- OpenAI-compatible API for easy integration  
- *Thinking* and *non-thinking* model variants (`deepseek-reasoner`, `deepseek-chat`)  
- Excellent reasoning and coding performance  
- Significantly more affordable pricing compared to proprietary APIs  

Official platform: [https://api.deepseek.com](https://api.deepseek.com)

---

## Prerequisites

Before integrating, ensure:
- React Native development environment setup  
- Node.js and npm/yarn installed  
- Basic JavaScript or TypeScript knowledge  
- A valid **DeepSeek API key**  

> ⚠️ **Security Note:** Never expose API keys in frontend code. Use environment variables.

---

## Step 1: Set Up Your DeepSeek Account

### 1.1 Create an Account
1. Go to [https://api.deepseek.com](https://api.deepseek.com)  
2. Register with your email  
3. Complete verification  

### 1.2 Generate API Key
1. Navigate to **Access API → API Keys**  
2. Click **Create new API Key**  
3. Name it for reference and copy the value (it’s shown only once)

---

## Step 2: Project Setup & Dependencies

### 2.1 Install Required Packages

For basic HTTP calls:
```bash
npm install axios
# or
yarn add axios
```

For chat UI:
```bash
npm install react-native-gifted-chat axios react-native-paper react-native-safe-area-context
```

### 2.2 Environment Configuration

Create `.env`:
```env
DEEPSEEK_API_KEY=your-api-key-here
```

Create `config/deepseek.js`:
```javascript
export const DEEPSEEK_CONFIG = {
  API_URL: 'https://api.deepseek.com/v1/chat/completions',
  BASE_URL: 'https://api.deepseek.com',
  MODELS: {
    CHAT: 'deepseek-chat',
    REASONER: 'deepseek-reasoner'
  }
};
```

---

## Step 3: API Service

Create `services/deepseekService.js`:
```javascript
import axios from 'axios';
import { DEEPSEEK_CONFIG } from '../config/deepseek';

export class DeepSeekService {
  constructor(apiKey) {
    this.client = axios.create({
      baseURL: DEEPSEEK_CONFIG.BASE_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async sendMessage(messages, model = DEEPSEEK_CONFIG.MODELS.CHAT, stream = false) {
    try {
      const response = await this.client.post('/v1/chat/completions', {
        model,
        messages,
        stream,
        temperature: 0.7,
        max_tokens: 1000,
      });
      return response.data;
    } catch (error) {
      console.error('DeepSeek API Error:', error);
      throw error;
    }
  }

  async streamMessage(messages, onMessage, model = DEEPSEEK_CONFIG.MODELS.CHAT) {
    try {
      const response = await this.client.post('/v1/chat/completions', {
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1000,
      }, { responseType: 'stream' });

      response.data.on('data', chunk => {
        const lines = chunk.toString().split('\n');
        lines.forEach(line => {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                onMessage(data.choices[0].delta.content);
              }
            } catch {}
          }
        });
      });
    } catch (error) {
      console.error('DeepSeek Streaming Error:', error);
      throw error;
    }
  }
}
```

---

## Step 4: Building a Chat Interface

Create `components/DeepSeekChat.js`:
```javascript
import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { GiftedChat } from 'react-native-gifted-chat';
import { DeepSeekService } from '../services/deepseekService';

const DeepSeekChat = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const deepSeekService = new DeepSeekService(process.env.DEEPSEEK_API_KEY);

  useEffect(() => {
    setMessages([{
      _id: 1,
      text: 'Hello! I\'m your AI assistant powered by DeepSeek.',
      createdAt: new Date(),
      user: { _id: 2, name: 'DeepSeek AI', avatar: 'https://cdn.deepseek.com/platform/favicon.png' },
    }]);
  }, []);

  const onSend = useCallback(async (newMessages = []) => {
    setMessages(prev => GiftedChat.append(prev, newMessages));
    const userMessage = newMessages[0];
    setLoading(true);

    try {
      const chatHistory = messages.map(m => ({
        role: m.user._id === 1 ? 'user' : 'assistant',
        content: m.text,
      }));
      chatHistory.push({ role: 'user', content: userMessage.text });

      const response = await deepSeekService.sendMessage(chatHistory);
      const aiMessage = response.choices[0].message.content;

      setMessages(prev => GiftedChat.append(prev, [{
        _id: Math.random().toString(),
        text: aiMessage,
        createdAt: new Date(),
        user: { _id: 2, name: 'DeepSeek AI', avatar: 'https://cdn.deepseek.com/platform/favicon.png' },
      }]));
    } catch {
      setMessages(prev => GiftedChat.append(prev, [{
        _id: Math.random().toString(),
        text: 'Sorry, an error occurred. Try again.',
        createdAt: new Date(),
        user: { _id: 2, name: 'DeepSeek AI' },
      }]));
    } finally {
      setLoading(false);
    }
  }, [messages]);

  return (
    <View style={styles.container}>
      <GiftedChat messages={messages} onSend={onSend} user={{ _id: 1, name: 'User' }} isTyping={loading} />
    </View>
  );
};

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#f5f5f5' } });
export default DeepSeekChat;
```

---

## Step 5: Advanced Features

### 5.1 Streaming Responses  
Use `streamMessage()` to deliver responses in real time (ideal for calorie estimation explanations or Liftor AI chat).

### 5.2 Model Selection  
Toggle between `deepseek-chat` (fast) and `deepseek-reasoner` (detailed reasoning).

---

## Step 6: Error Handling & Best Practices

### 6.1 Security
- Store API keys in `.env`
- Use HTTPS
- Sanitize user inputs
- Implement retry logic and rate limiting

### 6.2 Performance
- Use streaming for long responses  
- Cache messages to reduce re-fetching  
- Optimize re-renders with `React.memo`

---

## Step 7: Testing

### API Tests Example
```javascript
import { DeepSeekService } from '../services/deepseekService';

test('API should respond', async () => {
  const service = new DeepSeekService('test-key');
  const response = await service.sendMessage([{ role: 'user', content: 'Hello' }]);
  expect(response.choices[0].message.content).toBeDefined();
});
```

---

## Step 8: Deployment

- Hide `.env` in `.gitignore`
- Use production monitoring (e.g., Sentry)
- Add iOS ATS exceptions and Android network permissions
- Configure timeouts and retry strategies

---

## Troubleshooting

| Issue | Solution |
|-------|-----------|
| Invalid API Key | Regenerate key on DeepSeek dashboard |
| Rate limit exceeded | Wait or use paid plan |
| Network errors | Check HTTPS config and connectivity |

---

## References

- **Docs:** [https://api-docs.deepseek.com](https://api-docs.deepseek.com)  
- **Example Repo:** [https://github.com/hellochirag/deepseek-react-native](https://github.com/hellochirag/deepseek-react-native)  
- **Tutorial:** [https://dev.to/malik_chohra/integrate-deepseek-ai-into-react-native-app-full-guide](https://dev.to/malik_chohra/integrate-deepseek-ai-into-react-native-app-full-guide)

---

## Conclusion

Integrating DeepSeek AI empowers **Liftor** with:
- Intelligent calorie reasoning & chat  
- Cost-effective OpenAI-compatible backend  
- Real-time feedback & analysis  
- Cross-platform scalability  

> **By following this guide, Liftor gains AI depth with minimal cost and complete control.**
