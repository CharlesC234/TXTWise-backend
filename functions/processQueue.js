const axios = require('axios');
require('dotenv').config();
const Conversation = require('../models/conversation');
const Message = require('../models/message');
const User = require('../models/user');
const MessageQueue = require('../models/queue');
const sendSms = require('./sendSMS');

let isProcessing = false; // Prevent multiple workers from running

// AI Models are now mapped by LLM name instead of phone numbers
const AI_MAP = {
    "claude": { 
        name: 'claude-3-opus-20240229', 
        apiKey: process.env.CLAUDE_API_KEY, 
        url: 'https://api.anthropic.com/v1/messages' 
    },
    "chatgpt": { 
        name: 'gpt-4o', 
        apiKey: process.env.CHATGPT_API_KEY, 
        url: 'https://api.openai.com/v1/chat/completions' 
    },
    "deepseek": { 
        name: 'deepseek-chat', 
        apiKey: process.env.DEEPSEEK_API_KEY, 
        url: 'https://api.deepseek.com/v1/chat/completions' 
    },
    "gemini": { 
        name: 'gemini-1.5-pro-latest', 
        apiKey: process.env.GEMINI_API_KEY, 
        url: `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-latest:generateContent?key=${process.env.GEMINI_API_KEY}`
    },
    "grok": { 
        name: 'grok-2-latest', 
        apiKey: process.env.GROK_API_KEY, 
        url: 'https://grok.x.ai/v1/chat/completions' 
    }
};


const processQueue = async () => {
    if (isProcessing) return; // Prevent duplicate processing
    isProcessing = true;
    console.log("Processing message queue...");

    while (true) {
        // Fetch the oldest "pending" message
        const job = await MessageQueue.findOneAndUpdate(
            { status: 'pending' },
            { status: 'processing' },
            { new: true }
        );

        if (!job) break; // No more pending messages, exit loop

        try {
            console.log(`Processing message from ${job.from} to ${job.to}: ${job.messageBody}`);

            // Find user
            let user = await User.findOne({ phoneNumber: job.from });
            if (!user) {
                console.error(`User not found for phone number: ${job.from}`);
                throw new Error("User not found");
            }

            // Find conversation where "to" matches "fromPhone"
            let conversation = await Conversation.findOne({ fromPhone: job.to, user: user._id });

            if (!conversation) {
                console.error(`No active conversation found for ${job.to}`);
                throw new Error("No active conversation found");
            }

            // Identify AI model based on conversation's `llm` field
            const aiConfig = AI_MAP[conversation.llm];
            if (!aiConfig) {
                console.error(`Invalid AI model specified: ${conversation.llm}`);
                throw new Error(`Invalid AI model: ${conversation.llm}`);
            }

            console.log(`Using AI model: ${conversation.llm} (${aiConfig.name})`);

            // Save Incoming Message
            const userMessage = await Message.create({
                conversationId: conversation._id,
                sender: user._id,
                messageBody: job.messageBody,
                isAI: false,
            });

            conversation.messages.push(userMessage._id);
            await conversation.save();

            // Fetch Chat History
            const fullHistory = await Message.find({ conversationId: conversation._id })
                .sort({ timestamp: 1 }) // Sort messages by timestamp (oldest first)
                .lean();

            // Format messages for API
            const formattedMessages = fullHistory.map((msg) => ({
                role: msg.isAI ? 'assistant' : 'user',
                content: msg.messageBody,
            }));

                // Determine request payload based on AI model
                let requestBody, requestHeaders;

                // Special handling for Gemini
                if (aiConfig.name.startsWith("gemini")) {
                    requestBody = {
                        contents: formattedMessages.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] }))
                    };
                    requestHeaders = {
                        'Content-Type': 'application/json', // No Authorization header for Gemini
                    };
                } else {
                    requestBody = {
                        model: aiConfig.name, // e.g., "gpt-4o"
                        messages: formattedMessages, // Properly formatted messages
                    };
                    requestHeaders = {
                        'Authorization': `Bearer ${aiConfig.apiKey}`,
                        'Content-Type': 'application/json',
                    };
                }

                // Send message to AI API
                const aiResponse = await axios.post(
                    aiConfig.url, 
                    requestBody, 
                    { headers: requestHeaders }
                );

            const aiText = aiResponse.data.choices?.[0]?.message?.content || 'No response from AI.';

            // Save AI Message
            const aiMessage = await Message.create({
                conversationId: conversation._id,
                sender: user._id,
                messageBody: aiText,
                isAI: true,
            });

            conversation.messages.push(aiMessage._id);
            await conversation.save();

            // Send AI response to user via SMS
            await sendSms(aiText, job.to, job.from);

            console.log(`Sent reply to ${job.from} using ${conversation.llm}: ${aiText}`);

            // Mark message as completed
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
