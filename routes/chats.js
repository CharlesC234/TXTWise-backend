const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation');
const User = require('../models/user');
const Message = require('../models/message');
const twilio = require('twilio');
require('dotenv').config();
const { verifyToken } = require('../functions/verifyToken');
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);


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

/**
 * CREATE a new conversation
 */
router.post('/', verifyToken, async (req, res) => {
    try {
      const { phoneNumber, LLM, initialPrompt } = req.body;
  
      if (!phoneNumber || !LLM) {
        return res.status(400).json({ error: "Missing required fields: phoneNumber, LLM" });
      }

      // Find user by phone number
      const user = await User.findOne({ phoneNumber });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const userId = user._id;
  
      // Create a new conversation
      const conversation = new Conversation({
        user: userId,
        llm: LLM.toLowerCase(),
        initialPrompt: initialPrompt || "", // Save only if provided
        messages: [],
      });
  
      // Save conversation to DB
      const savedConversation = await conversation.save();
  
      // Link conversation to user
      await User.updateOne(
        { _id: userId },
        { $push: { conversations: savedConversation._id } }
      );

      // **Send a Welcome Message via Twilio**
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

      await twilioClient.messages.create({
        body: welcomeMessage,
        from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio phone number
        to: phoneNumber
      });

      res.status(201).json(savedConversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
});



/**
 * PAUSE a conversation (add paused flag)
 */
router.put('/pause/:id', verifyToken, async function (req, res) {
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
router.put('/resume/:id', verifyToken, async function (req, res){
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
router.delete('/:id', verifyToken, async function (req, res){
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
router.put('/:id', verifyToken, async function (req, res){
  const { messages, LLM } = req.body;

  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

  if (LLM) conversation.llm = LLM;
  if (messages) conversation.messages = messages;

  conversation.updatedAt = new Date();

  const updatedConversation = await conversation.save();

  res.status(200).json({ message: 'Conversation updated', updatedConversation });
});

module.exports = router;
