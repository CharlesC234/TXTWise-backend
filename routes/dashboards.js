const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const Subscription = require('../models/subscription');
const tempClient = require('../functions/tempClient'); // Redis utility functions
const { verifyToken } = require('../functions/verifyToken');
const TokenUsage = require('../models/tokens');
require('dotenv').config();

const router = express.Router();

// Middleware for error handling
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);




router.get('/token-usage', verifyToken, async (req, res) => {
    try {
      const phoneNumber = req.userId; // Assuming req.userId holds phoneNumber from middleware
  
      const user = await User.findOne({ phoneNumber });
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      const timeframe = req.query.timeframe || 'week';
  
      let startDate = new Date();
      startDate.setHours(0, 0, 0, 0); // Normalize to start of day
  
      switch (timeframe) {
        case 'month':
          startDate.setDate(1);
          break;
        case 'year':
          startDate.setMonth(0, 1);
          break;
        case 'all':
          startDate = new Date(0); // Epoch time
          break;
        case 'week':
        default:
          startDate.setDate(startDate.getDate() - 6);
          break;
      }
  
      const usageRecords = await TokenUsage.find({
        user: user._id,
        date: { $gte: startDate }
      }).lean();
  
      // Generate date range
      const daysRange = [];
      const tempDate = new Date(startDate);
      while (tempDate <= new Date()) {
        daysRange.push(new Date(tempDate));
        tempDate.setDate(tempDate.getDate() + 1);
      }
  
      const usageByModel = {
        chatgpt: [],
        claude: [],
        deepseek: [],
        grok: [],
        gemini: [],
      };
  
      daysRange.forEach(date => {
        const formattedDate = date.toISOString().slice(0, 10);
        for (const model in usageByModel) {
          const record = usageRecords.find(r =>
            r.model === model && r.date.toISOString().slice(0, 10) === formattedDate
          );
          usageByModel[model].push(record ? record.tokensUsed : 0);
        }
      });
  
      res.json({
        categories: daysRange.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
        series: Object.keys(usageByModel).map(model => ({
          name: model.charAt(0).toUpperCase() + model.slice(1),
          data: usageByModel[model]
        }))
      });
  
    } catch (err) {
      console.error("Token usage route error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  


/**
 * GET Dashboard Info: Active Chats, Daily Tokens Left
 * Route: GET /dashboards/
 */
router.get(
  '/',
  verifyToken, async function (req, res){
    const phoneNumber = req.userId;

    console.log(req.userId);

    // Fetch user details
    const user = await User.findOne({ phoneNumber })
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
      llm: conv.llm,
      initialPrompt: conv.initialPrompt,
      name: conv.name,
      phone: conv.fromPhone,
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
