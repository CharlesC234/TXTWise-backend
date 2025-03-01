const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const twilio = require('twilio');
const Queue = require('bull');
const Redis = require('ioredis');
require('dotenv').config();

const Conversation = require('../models/conversation');
const Message = require('../models/message');
const User = require('../models/user');

const router = express.Router();

// Twilio Client
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Redis Connection for Bull Queue
// const redisClient = new Redis(process.env.REDIS_URL);

// Bull Queue for Rate Limiting
const messageQueue = new Queue('smsQueue', process.env.REDIS_URL);

// AI Model Mapping
const AI_MAP = {
  [process.env.TWILIO_PHONE_1]: { name: 'Claude', apiKey: process.env.CLAUDE_API_KEY, url: 'https://api.claude.ai' },
  [process.env.TWILIO_PHONE_2]: { name: 'ChatGPT', apiKey: process.env.CHATGPT_API_KEY, url: 'https://api.openai.com/v1/chat/completions' },
  [process.env.TWILIO_PHONE_3]: { name: 'Deepseek', apiKey: process.env.DEEPSEEK_API_KEY, url: 'https://api.deepseek.com/v1' },
  [process.env.TWILIO_PHONE_4]: { name: 'Gemini', apiKey: process.env.GEMINI_API_KEY, url: 'https://api.gemini.com/v1' },
  [process.env.TWILIO_PHONE_5]: { name: 'Grok', apiKey: process.env.GROK_API_KEY, url: 'https://api.grok.com/v1' },
};

// Middleware: Parse URL-encoded Twilio data
router.use(bodyParser.urlencoded({ extended: false }));

// Webhook for Incoming SMS
router.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const to = req.body.To;
  const incomingMessage = req.body.Body;

  console.log(`Incoming message from ${from} to ${to}: ${incomingMessage}`);

      // Check if the sender is a registered user
      const user = await User.findOne({ phoneNumber: from });

      if (!user) {
        console.log(`Unauthorized number: ${from}. Sending registration link.`);
        
        await twilioClient.messages.create({
          body: "You are not registered. Please create an account at https://txtwise.io to use this service.",
          from: to,
          to: from,
        });
  
        return res.status(200).send('<Response></Response>'); // Stop further processing
      }

  // Enqueue the message to respect rate limits
  messageQueue.add({
    from,
    to,
    incomingMessage,
  });

  res.status(200).send('<Response></Response>'); // Twilio requires an immediate response
});

// Queue Processor
messageQueue.process(async (job) => {
  const { from, to, incomingMessage } = job.data;

  try {
    // Identify AI API based on Twilio Number
    const aiConfig = AI_MAP[to];
    if (!aiConfig) throw new Error('Invalid Twilio Number');

    // Find or Create User
    let user = await User.findOne({ phoneNumber: from });
    if (!user) {
      user = await User.create({ phoneNumber: from });
    }

    // Find or Create Conversation
    let conversation = await Conversation.findOne({ user: user._id });
    if (!conversation) {
      conversation = await Conversation.create({ user: [user._id], messages: [] });
    }

    // Save Incoming Message
    const userMessage = await Message.create({
      conversationId: conversation._id,
      sender: user._id,
      messageBody: incomingMessage,
      isAI: false,
    });


    conversation.messages.push(userMessage._id);
    await conversation.save();

    // Fetch Full Chat History
    const fullHistory = await Message.find({ conversationId: conversation._id })
      .sort({ timestamp: 1 })
      .lean();

    // Prepare messages for AI API
    const formattedMessages = fullHistory.map((msg) => ({
      role: msg.isAI ? 'assistant' : 'user',
      content: msg.messageBody,
    }));

    // Call AI API
    const aiResponse = await axios.post(
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

    // Send AI Response Back via Twilio SMS
    await twilioClient.messages.create({
      body: aiText,
      from: to,
      to: from,
    });

    console.log(`Replied to ${from} using ${aiConfig.name}: ${aiText}`);
  } catch (error) {
    console.error('Error processing SMS:', error);

    // Notify user of the error via SMS
    await twilioClient.messages.create({
      body: 'Sorry, there was an issue processing your message. Please try again later.',
      from: to,
      to: from,
    });
  }
});

module.exports = router;
