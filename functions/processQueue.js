const axios = require('axios');
require('dotenv').config();
const Conversation = require('../models/conversation');
const Message = require('../models/message');
const User = require('../models/user');
const MessageQueue = require('../models/queue');
const sendSms = require('./sendSMS');

// SDK Imports
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

let isProcessing = false;

// AI_MAP remains for identification purposes
const AI_MAP = {
    "claude": { name: 'claude-3-opus-20240229', apiKey: process.env.CLAUDE_API_KEY },
    "chatgpt": { name: 'gpt-4o', apiKey: process.env.CHATGPT_API_KEY, url: 'https://api.openai.com/v1/chat/completions' },
    "deepseek": { name: 'deepseek-chat', apiKey: process.env.DEEPSEEK_API_KEY, url: 'https://api.deepseek.com/v1/chat/completions' },
    "gemini": { name: 'gemini-1.5-pro-latest', apiKey: process.env.GEMINI_API_KEY },
    "grok": { name: 'grok-2-latest', apiKey: process.env.GROK_API_KEY, url: 'https://api.x.ai/v1/chat/completions' },
};

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
            console.log(`Processing message from ${job.from} to ${job.to}: ${job.messageBody}`);

            const user = await User.findOne({ phoneNumber: job.from });
            if (!user) throw new Error("User not found");

            const conversation = await Conversation.findOne({ fromPhone: job.to, user: user._id });
            if (!conversation) throw new Error("No active conversation found");

            const aiConfig = AI_MAP[conversation.llm];
            if (!aiConfig) throw new Error(`Invalid AI model: ${conversation.llm}`);

            console.log(`Using AI model: ${conversation.llm} (${aiConfig.name})`);

            const userMessage = await Message.create({
                conversationId: conversation._id,
                sender: user._id,
                messageBody: job.messageBody,
                isAI: false,
            });

            conversation.messages.push(userMessage._id);
            await conversation.save();

            const fullHistory = await Message.find({ conversationId: conversation._id }).sort({ timestamp: 1 }).lean();
            const formattedMessages = fullHistory.map(msg => ({
                role: msg.isAI ? 'assistant' : 'user',
                content: msg.messageBody,
            }));

            let aiText = 'No response from AI.';

            // Claude Handling
            if (conversation.llm === 'claude') {
                const anthropic = new Anthropic({ apiKey: aiConfig.apiKey });
                const response = await anthropic.messages.create({
                    model: aiConfig.name,
                    max_tokens: 1000,
                    messages: formattedMessages,
                });
                aiText = response?.content?.[0]?.text || 'No response from Claude.';
                console.log("Claude Response:", response);

            // Deepseek Handling (OpenAI SDK with baseURL)
            } else if (conversation.llm === 'deepseek') {
                const openai = new OpenAI({
                    apiKey: aiConfig.apiKey,
                    baseURL: 'https://api.deepseek.com',
                });

                const response = await openai.chat.completions.create({
                    model: aiConfig.name,
                    messages: formattedMessages,
                });
                aiText = response.choices?.[0]?.message?.content || 'No response from Deepseek.';
                console.log("Deepseek Response:", response);

            // Gemini Handling
            } else if (conversation.llm === 'gemini') {
                const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
                const model = genAI.getGenerativeModel({ model: aiConfig.name });

                const result = await model.generateContent(job.messageBody);
                aiText = await result.response.text();
                console.log("Gemini Response:", aiText);

            // ChatGPT & Grok - handled via Axios
            } else {
                const response = await axios.post(
                    aiConfig.url,
                    {
                        model: aiConfig.name,
                        messages: formattedMessages,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${aiConfig.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
                aiText = response.data.choices?.[0]?.message?.content || 'No response from AI.';
                console.log("ChatGPT/Grok Response:", response.data);
            }

            const aiMessage = await Message.create({
                conversationId: conversation._id,
                sender: user._id,
                messageBody: aiText,
                isAI: true,
            });

            conversation.messages.push(aiMessage._id);
            await conversation.save();

            await sendSms(aiText, job.to, job.from);
            console.log(`Sent reply to ${job.from} using ${conversation.llm}: ${aiText}`);

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
