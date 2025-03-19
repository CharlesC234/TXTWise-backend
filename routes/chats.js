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

  const getUserByPhone = async (phoneNumber) => {
    const user = await User.findOne({ phoneNumber });
    if (!user) throw new Error('User not found');
    return user;
  };


  const sendUserAlert = async (userPhone, fromPhone, message) => {
    try {
      await sendSms(message, fromPhone, userPhone);
    } catch (err) {
      console.error('Failed to send user alert SMS:', err);
    }
  };
  


async function findUserConversation(req, res, next) {
    const user = await getUserByPhone(req.userId);
    const userId = user._id;
  
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }
  
    const conversation = await Conversation.findOne({ _id: req.params.id, user: userId });
  
    if (!conversation) return res.status(404).json({ message: 'Conversation not found or not authorized' });
  
    req.conversation = conversation; 
    next();
  }

/**
 * CREATE a new conversation
 */
router.post('/', verifyToken, async (req, res) => {
    try {
        const { phoneNumber, LLM, initialPrompt, fromPhone, chatName, historyDisabled } = req.body;
  
      if (!phoneNumber || !LLM || !fromPhone) {
        return res.status(400).json({ error: "Missing required fields: phoneNumber, LLM, fromPhone" });
      }
  

      const user = await User.findOne({ phoneNumber });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
  
      const userId = user._id;

      const existingConversations = await Conversation.find({ user: userId });
      const userConvoCount = existingConversations.length;
  

    //   const maxConvosAllowed = user.subscriptionStatus === 'free' ? 1 : 5;
      const maxConvosAllowed = 5;
      if (userConvoCount >= maxConvosAllowed) {
        return res.status(403).json({ error: `Conversation limit reached. Max allowed: ${maxConvosAllowed}` });
      }
  

      const conversation = new Conversation({
        user: userId,
        llm: LLM.toLowerCase(),
        name: chatName || LLM,
        fromPhone,
        initialPrompt: initialPrompt?.trim() || "",
        messages: [],
        historyDisabled: user.subscriptionStatus == "free" ? false : historyDisabled || false
      });
  
      const savedConversation = await conversation.save();
  

      await User.updateOne(
        { _id: userId },
        { $push: { conversations: savedConversation._id } }
      );
  
      // 📲 Send welcome SMS
      const welcomeMessage = `
  Welcome to TXTWise! 
  
  You are now chatting with ${LLM}. To start, just send a message.
  
  *How to use this chat*:
  - Send any message to start the conversation.
  - If you provided an initial prompt, the chatbot will respond accordingly.
  - Switch models at any time by typing: "CHATGPT", "GROK", "GEMINI", "DEEPSEEK", or "CLAUDE"
  
  - To opt out, reply with *STOP*.
  - To restart a chat, reply with *RESET*.
  - Need help? Reply with *HELP*.
  - Other useful keywords: "KEYWORDS", "STATUS", "AI", "TOKENS", "SUBSCRIPTION"
  
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



  router.post('/ping/:id', verifyToken, async (req, res) => {
    try {
      const phoneNumber = req.userId; // Phone number from token
      const user = await User.findOne({ phoneNumber });
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      const conversation = await Conversation.findOne({ _id: req.params.id, user: user._id });
      if (!conversation) return res.status(404).json({ message: 'Conversation not found or unauthorized' });
  
      // Construct Ping Message (similar to Welcome Message)
      const pingMessage = `
  Ping from TXTWise:
  
  You're chatting with *${conversation.llm.toUpperCase()}*. Send a message anytime.
  
   - Need help? Reply with *HELP*.
   - To opt out, reply with *STOP*.
   - To restart chat, reply *RESET*.
  `;
  
      await sendSms(pingMessage, conversation.fromPhone, phoneNumber);
      res.status(200).json({ message: 'Ping sent successfully.' });
    } catch (err) {
      console.error('Ping chat error:', err);
      res.status(500).json({ message: 'Error sending ping.', error: err.message });
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
  
 
    await sendUserAlert(req.userId, conversation.fromPhone, '*** Your chat has been paused. Resume it anytime from your dashboard.');
  
    res.status(200).json({ message: 'Conversation paused', conversation });
  });
  

/**
 * PAUSE all conversations
 */
router.put('/pauseAll', verifyToken, async function (req, res) {
    try {
      const user = await getUserByPhone(req.userId);
      const userId = user._id; 
  
      await Conversation.updateMany(
        { user: userId }, 
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
  

    await sendUserAlert(req.userId, conversation.fromPhone, '*** Your chat has been resumed and is now active.');
  
    res.status(200).json({ message: 'Conversation resumed', conversation });
  });
  

/**
 * RESUME all conversations
 */
router.put('/resumeAll', verifyToken, async function (req, res) {
    try {
      const user = await getUserByPhone(req.userId);
      const userId = user._id;
  
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
  
    
    await sendUserAlert(req.userId, conversation.fromPhone, '***** Your chat has been deleted. You can create a new chat anytime.');
  

    await Message.deleteMany({ conversationId: conversation._id });
  

    await User.updateMany(
      { _id: { $in: conversation.user } },
      { $pull: { conversations: conversation._id } }
    );
  
    await conversation.deleteOne();
  
    res.status(200).json({ message: 'Conversation deleted' });
  });
  

/**
 * DELETE all conversations
 */
router.delete('/deleteAll', verifyToken, async function (req, res) {
    try {
      const user = await getUserByPhone(req.userId);
      const userId = user._id;
  
    
      const userConversations = await Conversation.find({ user: userId });
  
      const conversationIds = userConversations.map((conv) => conv._id);
  
      await Message.deleteMany({ conversationId: { $in: conversationIds } });
  
      await Conversation.deleteMany({ _id: { $in: conversationIds } });
  
      await User.findByIdAndUpdate(userId, { $set: { conversations: [] } });
  
      res.status(200).json({ message: 'All your conversations and messages have been deleted.' });
    } catch (err) {
      res.status(500).json({ message: 'Error deleting conversations', error: err });
    }
  });
  

/**
 * EDIT conversation (e.g., change users, update data)
 */
router.put('/:id', verifyToken, findUserConversation, async function (req, res) {
    const { chatName, llm, initialPrompt, historyDisabled } = req.body;
    const phoneNumber = req.userId;
  
    const user = await User.findOne({ phoneNumber });
    if (!user) return res.status(404).json({ message: 'User not found' });
  
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
  
    if (llm) conversation.llm = llm;
    if (chatName) conversation.name = chatName;
    if (initialPrompt) conversation.initialPrompt = initialPrompt;
  
    if (typeof historyDisabled === 'boolean') {
      if (user.subscriptionStatus === 'premium') {
        conversation.historyDisabled = historyDisabled;
      } 
    }
  
    conversation.updatedAt = new Date();
    const updatedConversation = await conversation.save();
  
    await sendUserAlert(phoneNumber, conversation.fromPhone, '*** Your chat settings have been updated.');
  
    res.status(200).json({ message: 'Conversation updated', updatedConversation });
  });
  
  


// GET /api/conversation/available-number
router.get('/available-number', verifyToken, async (req, res) => {
    try {
      const phoneNumber = req.userId;
  
      const user = await User.findOne({ phoneNumber });
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      const userConversations = await Conversation.find({ user: user._id });
      const userConvoCount = userConversations.length;
  
    //   const maxConvosAllowed = user.subscriptionStatus === 'free' ? 1 : 5;
      const maxConvosAllowed = 5;

      if (userConvoCount >= maxConvosAllowed) {
        return res.status(403).json({ error: 'Conversation limit reached for your subscription level.' });
      }
  
      const conversationCounts = await Conversation.aggregate([
        { $match: { fromPhone: { $in: CONVERSATION_NUMBERS } } },
        { $group: { _id: "$fromPhone", count: { $sum: 1 } } }
      ]);
  
      const phoneUsageMap = {};
      CONVERSATION_NUMBERS.forEach(num => {
        phoneUsageMap[num] = 0;
      });
  
      conversationCounts.forEach(entry => {
        phoneUsageMap[entry._id] = entry.count;
      });
  
      const userPhoneNumbers = new Set(userConversations.map(convo => convo.fromPhone));
  
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
      const phoneNumber = req.userId; 
  
      const user = await User.findOne({ phoneNumber });
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      const activeCount = await Conversation.countDocuments({ user: user._id, paused: false });
  
      res.json({ activeConversations: activeCount });
  
    } catch (err) {
      console.error('Error fetching active conversation count:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });


  router.get('/:id', verifyToken, async function (req, res) {
    const phoneNumber = req.userId;
  
    const user = await User.findOne({ phoneNumber });
    if (!user) return res.status(404).json({ message: 'User not found' });
  
    const conversation = await Conversation.findOne({ _id: req.params.id, user: user._id })
    .populate('user', 'name phoneNumber')
    .populate('messages'); // Removed .lean()
  
  if (!conversation) return res.status(404).json({ message: 'Conversation not found or unauthorized' });
  
  res.status(200).json(conversation); // toJSON triggers decryption
  });
  

  

module.exports = router;
