const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const Subscription = require('../models/subscription');
const tempClient = require('../functions/tempClient'); // Redis utility functions
const { verifyToken } = require('../functions/verifyToken');
require('dotenv').config();

const router = express.Router();

// Middleware for error handling
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET Dashboard Info: Active Chats, Daily Tokens Left
 * Route: GET /dashboards/
 */
router.get(
  '/',
  verifyToken, async function (req, res){
    const userId = req.userId;

    // Fetch user details
    const user = await User.findById(userId)
      .populate({
        path: 'conversations',
        populate: {
          path: 'messages',
        },
      })
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Extract active conversations and tokens
    const activeConversations = user.conversations.map((conv) => ({
      conversationId: conv._id,
      messageCount: conv.messages.length,
      lastUpdated: conv.updatedAt,
    }));

    res.status(200).json({
      phoneNumber: user.phoneNumber,
      dailyTokensRemaining: user.dailyTokensRemaining,
      activeConversations,
    });
  });

/**
 * GET Subscription Status
 * Route: GET /dashboards/subscribed
 */
router.get(
  '/subscribed',
  verifyToken, async function (req, res){
    const userId = req.userId;

    // Check Subscription Status
    const subscription = await Subscription.findOne({ userId, status: 'active' });

    res.status(200).json({
      isSubscribed: !!subscription,
      planType: subscription ? subscription.planType : 'free',
      status: subscription ? subscription.status : 'inactive',
    });
  });


  /**
 * GET user data
 * Route: GET /dashboards/user
 */
router.get(
    '/user',
    verifyToken, async function (req, res){
      const userId = req.userId;
  
      // get user by id
      const userData = await User.findOne({ userId});
  
      res.status(200).json(userData);
    });

module.exports = router;
