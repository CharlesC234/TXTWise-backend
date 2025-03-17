const axios = require('axios');
require('dotenv').config();
const Conversation = require('../models/conversation');
const Message = require('../models/message');
const User = require('../models/user');
const MessageQueue = require('../models/queue');
const sendSms = require('./sendSMS');
const { logTokenUsage } = require('./logTokens');

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const openai = new OpenAI({ apiKey: process.env.CHATGPT_API_KEY });

let isProcessing = false;

const AI_MAP = {
  claude: { name: 'claude-3-opus-20240229', apiKey: process.env.CLAUDE_API_KEY },
  chatgpt: { name: 'gpt-4o', apiKey: process.env.CHATGPT_API_KEY, url: 'https://api.openai.com/v1/chat/completions' },
  deepseek: { name: 'deepseek-chat', apiKey: process.env.DEEPSEEK_API_KEY, url: 'https://api.deepseek.com/v1/chat/completions' },
  gemini: { name: 'gemini-1.5-pro-latest', apiKey: process.env.GEMINI_API_KEY },
  grok: { name: 'grok-2-latest', apiKey: process.env.GROK_API_KEY, url: 'https://api.x.ai/v1/chat/completions' },
};

const imageKeywords = [
  'generate image', 'make me an image', 'create an image', 'show me an image',
  'picture of', 'draw me', 'render an image', 'illustrate', 'make a picture',
  'image of', 'can you draw', 'render this',
];

const processQueue = async () => {
  if (isProcessing) return;
  isProcessing = true;
  console.log("Processing message queue...");

  while (true) {
    const job = await MessageQueue.findOneAndUpdate(
      { status: 'pending' },
      { status: 'processing' },
      { new: true }
    );

    if (!job) break;

    try {
        const decryptedMessage = job.getDecryptedMessage();
        console.log(`Processing message from ${job.from} to ${job.to}: ${decryptedMessage}`);
        

      const user = await User.findOne({ phoneNumber: job.from });
      if (!user) throw new Error("User not found");

      const conversation = await Conversation.findOne({ fromPhone: job.to, user: user._id });
      if (!conversation) throw new Error("No active conversation found");

      const aiConfig = AI_MAP[conversation.llm];
      if (!aiConfig) throw new Error(`Invalid AI model: ${conversation.llm}`);

      if (user.subscriptionStatus === 'free' && user.dailyTokensRemaining <= 0) {
        await sendSms("Daily token limit reached. Reset at midnight or upgrade at txtwise.io/pricing.", job.to, job.from);
        job.status = 'completed';
        await job.save();
        continue;
      }

      const userMessage = await Message.create({
        conversationId: conversation._id,
        sender: user._id,
        messageBody: decryptedMessage, // ✅ decrypted here, model will encrypt
        isAI: false,
      });

      conversation.messages.push(userMessage._id);
      await conversation.save();

      let aiText = 'No response from AI.';
      let mediaUrl = null;
      const lowerMessage = decryptedMessage.trim().toLowerCase();
    const isImageRequest = imageKeywords.some(keyword => lowerMessage.includes(keyword));

    if (isImageRequest) {
    const prompt = decryptedMessage.replace(/generate image:/i, '').trim();
    await sendSms("Generating your image... This may take a few minutes.", job.to, job.from);
    const imageResp = await openai.images.generate({ prompt, n: 1, size: '512x512' });
    mediaUrl = imageResp.data[0]?.url;
    aiText = `Here is your generated image:`;
    await logTokenUsage(user._id, conversation.llm, prompt, true);
    } else {
        // 🔓 Decrypt all messages for context
        const fullHistory = await Message.find({ conversationId: conversation._id }).sort({ timestamp: 1 });
        const decryptedHistory = await Promise.all(fullHistory.map(async (msg) => ({
          role: msg.isAI ? 'assistant' : 'user',
          content: msg.getDecryptedMessage(), // Custom decrypt method
        })));

        if (conversation.initialPrompt && conversation.initialPrompt.trim() !== "") {
          decryptedHistory.unshift({ role: 'user', content: conversation.initialPrompt.trim() });
        }

        if (conversation.llm === 'claude') {
          const anthropic = new Anthropic({ apiKey: aiConfig.apiKey });
          const response = await anthropic.messages.create({
            model: aiConfig.name,
            max_tokens: 1000,
            messages: decryptedHistory,
          });
          aiText = response?.content?.[0]?.text || 'No response from Claude.';
        } else if (conversation.llm === 'deepseek') {
          const openai = new OpenAI({ apiKey: aiConfig.apiKey, baseURL: 'https://api.deepseek.com' });
          const response = await openai.chat.completions.create({ model: aiConfig.name, messages: decryptedHistory });
          aiText = response.choices?.[0]?.message?.content || 'No response from Deepseek.';
        } else if (conversation.llm === 'gemini') {
          const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
          const model = genAI.getGenerativeModel({ model: aiConfig.name });
          const result = await model.generateContent(decryptedMessage); // ✅ decrypted

          aiText = await result.response.text();
        } else {
          const response = await axios.post(aiConfig.url,
            { model: aiConfig.name, messages: decryptedHistory },
            { headers: { 'Authorization': `Bearer ${aiConfig.apiKey}`, 'Content-Type': 'application/json' } }
          );
          aiText = response.data.choices?.[0]?.message?.content || 'No response from AI.';
        }

        await logTokenUsage(user._id, conversation.llm, aiText, false);
      }

      if (!conversation.historyDisabled) {
        const aiMessage = await Message.create({
          conversationId: conversation._id,
          sender: user._id,
          messageBody: aiText, // Encrypted automatically
          isAI: true,
        });

        conversation.messages.push(aiMessage._id);
        await conversation.save();
      }

      await sendSms(aiText, job.to, job.from, mediaUrl);
      job.status = 'completed';
      await job.save();
    } catch (error) {
      console.error('Error processing message:', error);
      job.status = 'failed';
      await job.save();
    }
  }

  isProcessing = false;
};

module.exports = processQueue;
