const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation');
const User = require('../models/user');
const Message = require('../models/message');
require('dotenv').config();
const { verifyToken } = require('../functions/verifyToken');
const sendSms = require('../functions/sendSMS');


const CONVERSATION_NUMBERS = [
    process.env.SIGNALWIRE_PHONE_NUMBER,
    process.env.SIGNALWIRE_PHONE_NUMBER_2,
    process.env.SIGNALWIRE_PHONE_NUMBER_3,
    process.env.SIGNALWIRE_PHONE_NUMBER_4,
    process.env.SIGNALWIRE_PHONE_NUMBER_5,
  ];

  // GET user's conversation by ID (ownership check)
async function findUserConversation(req, res, next) {
    const userId = req.userId;
  
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }
  
    const conversation = await Conversation.findOne({ _id: req.params.id, user: userId });
  
    if (!conversation) return res.status(404).json({ message: 'Conversation not found or not authorized' });
  
    req.conversation = conversation; // Pass to next handler
    next();
  }

/**
 * CREATE a new conversation
 */
router.post('/', verifyToken, async (req, res) => {
    try {
      const { phoneNumber, LLM, initialPrompt, fromPhone, chatName } = req.body;
  
      if (!phoneNumber || !LLM || !fromPhone) {
        return res.status(400).json({ error: "Missing required fields: phoneNumber, LLM, fromPhone" });
      }
  
      // 🔍 Find user by phone number
      const user = await User.findOne({ phoneNumber });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
  
      const userId = user._id;
  
      // 🔎 Count user's active conversations
      const existingConversations = await Conversation.find({ user: userId });
      const userConvoCount = existingConversations.length;
  
      // ✅ Subscription limit enforcement
      const maxConvosAllowed = user.subscriptionStatus === 'free' ? 1 : 5;
      if (userConvoCount >= maxConvosAllowed) {
        return res.status(403).json({ error: `Conversation limit reached. Max allowed: ${maxConvosAllowed}` });
      }
  
      // ✅ Create new conversation
      const conversation = new Conversation({
        user: userId,
        llm: LLM.toLowerCase(),
        name: chatName || LLM, // Default to LLM name if no chatName provided
        fromPhone,
        initialPrompt: initialPrompt?.trim() || "",
        messages: [],
      });
  
      const savedConversation = await conversation.save();
  
      // ✅ Link to user
      await User.updateOne(
        { _id: userId },
        { $push: { conversations: savedConversation._id } }
      );
  
      // 📲 Send welcome SMS
      const welcomeMessage = `
  Welcome to TXTWise! 🎉
  
  You are now chatting with ${LLM}. To start, just send a message.
  
  📌 *How to use this chat*:
  - Send any message to start the conversation.
  - If you provided an initial prompt, the chatbot will respond accordingly.
  - Switch models at any time by typing: "CHATGPT", "GROK", "GEMINI", "DEEPSEEK", or "CLAUDE"
  
  ❌ To opt out, reply with *STOP*.
  🔄 To restart a chat, reply with *RESET*.
  🛠️ Need help? Reply with *HELP*.
  
  Happy chatting!
  `;
  
      await sendSms(
        welcomeMessage,
        fromPhone,
        phoneNumber
      );
  
      res.status(201).json(savedConversation);
  
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
  



/**
 * PAUSE a conversation (add paused flag)
 */
router.put('/pause/:id', verifyToken, findUserConversation, async function (req, res) {
  const conversation = await Conversation.findByIdAndUpdate(
    req.params.id,
    { $set: { paused: true } },
    { new: true }
  );

  if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

  res.status(200).json({ message: 'Conversation paused', conversation });
});

/**
 * PAUSE all conversations
 */
router.put('/pauseAll', verifyToken, async function (req, res) {
    try {
      const userId = req.userId; // From verifyToken
  
      await Conversation.updateMany(
        { user: userId }, // Filter conversations by user
        { $set: { paused: true } }
      );
  
      res.status(200).json({ message: 'All your conversations have been paused.' });
    } catch (err) {
      res.status(500).json({ message: 'Error pausing conversations', error: err });
    }
  });

/**
 * RESUME a paused conversation
 */
router.put('/resume/:id', verifyToken, findUserConversation, async function (req, res){
  const conversation = await Conversation.findByIdAndUpdate(
    req.params.id,
    { $set: { paused: false } },
    { new: true }
  );

  if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

  res.status(200).json({ message: 'Conversation resumed', conversation });
});

/**
 * RESUME all conversations
 */
router.put('/resumeAll', verifyToken, async function (req, res) {
    try {
      const userId = req.userId;
  
      await Conversation.updateMany(
        { user: userId }, 
        { $set: { paused: false } }
      );
  
      res.status(200).json({ message: 'All your conversations have been resumed.' });
    } catch (err) {
      res.status(500).json({ message: 'Error resuming conversations', error: err });
    }
  });
  
/**
 * DELETE conversation by ID
 */
router.delete('/:id', verifyToken, findUserConversation, async function (req, res){
  const conversation = await Conversation.findById(req.params.id);

  if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

  // Remove messages related to the conversation
  await Message.deleteMany({ conversationId: conversation._id });

  // Remove conversation from users
  await User.updateMany(
    { _id: { $in: conversation.user } },
    { $pull: { conversations: conversation._id } }
  );

  // Delete conversation
  await conversation.remove();

  res.status(200).json({ message: 'Conversation deleted' });
});

/**
 * DELETE all conversations
 */
router.delete('/deleteAll', verifyToken, async function (req, res) {
    try {
      const userId = req.userId;
  
      // Find all conversations for the user
      const userConversations = await Conversation.find({ user: userId });
  
      const conversationIds = userConversations.map((conv) => conv._id);
  
      // Delete all messages in the user's conversations
      await Message.deleteMany({ conversationId: { $in: conversationIds } });
  
      // Delete the conversations
      await Conversation.deleteMany({ _id: { $in: conversationIds } });
  
      // Remove conversation references from the user
      await User.findByIdAndUpdate(userId, { $set: { conversations: [] } });
  
      res.status(200).json({ message: 'All your conversations and messages have been deleted.' });
    } catch (err) {
      res.status(500).json({ message: 'Error deleting conversations', error: err });
    }
  });
  

/**
 * EDIT conversation (e.g., change users, update data)
 */
router.put('/:id', verifyToken, findUserConversation, async function (req, res){
  const { messages, LLM } = req.body;

  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

  if (LLM) conversation.llm = LLM;
  if (messages) conversation.messages = messages;

  conversation.updatedAt = new Date();

  const updatedConversation = await conversation.save();

  res.status(200).json({ message: 'Conversation updated', updatedConversation });
});



// GET /api/conversation/available-number
router.get('/available-number', verifyToken, async (req, res) => {
    try {
      const phoneNumber = req.userId; // Assuming req.userId = phoneNumber from middleware
  
      const user = await User.findOne({ phoneNumber });
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      const userConversations = await Conversation.find({ user: user._id });
      const userConvoCount = userConversations.length;
  
      // Enforce conversation limits
      const maxConvosAllowed = user.subscriptionStatus === 'free' ? 1 : 5;
      if (userConvoCount >= maxConvosAllowed) {
        return res.status(403).json({ error: 'Conversation limit reached for your subscription level.' });
      }
  
      // Build map of phone numbers and their total conversation count
      const conversationCounts = await Conversation.aggregate([
        { $match: { fromPhone: { $in: CONVERSATION_NUMBERS } } },
        { $group: { _id: "$fromPhone", count: { $sum: 1 } } }
      ]);
  
      const phoneUsageMap = {};
      CONVERSATION_NUMBERS.forEach(num => {
        phoneUsageMap[num] = 0; // Initialize to 0
      });
  
      conversationCounts.forEach(entry => {
        phoneUsageMap[entry._id] = entry.count;
      });
  
      // Get the phone numbers the user already has conversations with
      const userPhoneNumbers = new Set(userConversations.map(convo => convo.fromPhone));
  
      // Sort phone numbers by least usage, excluding ones the user already has
      const sortedAvailableNumbers = CONVERSATION_NUMBERS
        .filter(num => !userPhoneNumbers.has(num))
        .sort((a, b) => phoneUsageMap[a] - phoneUsageMap[b]);
  
      if (sortedAvailableNumbers.length === 0) {
        return res.status(409).json({ error: 'No available phone numbers for new conversation.' });
      }
  
      const selectedPhoneNumber = sortedAvailableNumbers[0];
      return res.json({ phoneNumber: selectedPhoneNumber });
  
    } catch (err) {
      console.error('Error selecting conversation phone number:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });


  router.get('/count', verifyToken, async (req, res) => {
    try {
      const phoneNumber = req.userId; // User's phone number from middleware
  
      const user = await User.findOne({ phoneNumber });
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      // Count all non-paused (active) conversations
      const activeCount = await Conversation.countDocuments({ user: user._id, paused: false });
  
      res.json({ activeConversations: activeCount });
  
    } catch (err) {
      console.error('Error fetching active conversation count:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });


  /**
 * GET conversation by ID (including messages and users)
 */
router.get('/:id', verifyToken, async function (req, res){
    const conversation = await Conversation.findById(req.params.id)
      .populate('user', 'name phoneNumber')
      .populate('messages')
      .exec();
  
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
  
    res.status(200).json(conversation);
  });

module.exports = router;
