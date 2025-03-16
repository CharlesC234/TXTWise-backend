const axios = require('axios');
require('dotenv').config();
const Conversation = require('../models/conversation');
const Message = require('../models/message');
const User = require('../models/user');
const MessageQueue = require('../models/queue');
const sendSms = require('./sendSMS');

let isProcessing = false; // Prevent multiple workers from running

const AI_MAP = {
    [process.env.SIGNALWIRE_PHONE_NUMBER_2]: { name: 'claude-3-opus-20240229', apiKey: process.env.CLAUDE_API_KEY, url: 'https://api.anthropic.com/v1/messages' },
    [process.env.SIGNALWIRE_PHONE_NUMBER]: { name: 'gpt-4o', apiKey: process.env.CHATGPT_API_KEY, url: 'https://api.openai.com/v1/chat/completions' },
    [process.env.SIGNALWIRE_PHONE_NUMBER_2]: { name: 'deepseek-chat', apiKey: process.env.DEEPSEEK_API_KEY, url: 'https://api.deepseek.com/v1/chat/completions' },
    [process.env.SIGNALWIRE_PHONE_NUMBER_2]: { name: 'gemini-1.5-pro-latest', apiKey: process.env.GEMINI_API_KEY, url: 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent' },
    [process.env.SIGNALWIRE_PHONE_NUMBER_2]: { name: 'grok-2-latest', apiKey: process.env.GROK_API_KEY, url: 'https://api.grok.com/v1/chat/completions' },
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

      // Identify AI API
      const aiConfig = AI_MAP[job.to];
      if (!aiConfig) throw new Error('Invalid Twilio Number');

      let user = await User.findOne({ phoneNumber: job.from });
      let conversation = await Conversation.findOne({ user: user._id });

      if (!conversation) {
        conversation = await Conversation.create({ user: [user._id], messages: [] });
      }

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
        // Fetch Chat History from MongoDB
        const fullHistory = await Message.find({ conversationId: conversation._id })
        .sort({ timestamp: 1 }) // Sort messages by timestamp (oldest first)
        .lean(); // Convert Mongoose objects to plain JSON

        // Transform into OpenAI's expected format
        const formattedMessages = fullHistory.map((msg) => ({
        role: msg.isAI ? 'assistant' : 'user', // Determine role based on isAI flag
        content: msg.messageBody, // Extract only the message content
        }));


      // Send message to AI API
      console.log(aiConfig.url);
      console.log(aiConfig.name);
      const aiResponse = await axios.post(
        aiConfig.url,
        {
          model: aiConfig.name, // e.g., "gpt-4-turbo"
          messages: formattedMessages, // Properly formatted messages
        },
        {
          headers: {
            'Authorization': `Bearer ${aiConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log("HERE: " + JSON.stringify(aiResponse.data.choices));
      

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

      console.log(`Sent reply to ${job.from} using ${aiConfig.name}: ${aiText}`);

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