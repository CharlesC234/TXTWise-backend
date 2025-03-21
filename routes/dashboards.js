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

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);




router.get('/token-usage', verifyToken, async (req, res) => {

    console.log("Token-usage, verified token");
    try {
      const phoneNumber = req.userId; 
      const user = await User.findOne({ phoneNumber });
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      const timeframe = req.query.timeframe || 'week';
      const usageByModel = {
        chatgpt: [],
        claude: [],
        deepseek: [],
        grok: [],
        gemini: [],
      };
  
      let categories = [];
  
      if (timeframe === 'today') {

        const now = new Date();
        now.setMinutes(0, 0, 0); // Round to start of current hour
        const startHour = new Date(now);
        startHour.setHours(now.getHours() - 23); // Past 24 hours
  
        const usageRecords = await TokenUsage.find({
          user: user._id,
          date: { $gte: startHour }
        }).lean();
  
        const hourlyRange = [];
        const tempHour = new Date(startHour);
        while (tempHour <= now) {
          hourlyRange.push(new Date(tempHour));
          tempHour.setHours(tempHour.getHours() + 1);
        }
  
        hourlyRange.forEach(hour => {
          const hourISO = hour.toISOString().slice(0, 13);
          categories.push(hour.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }));
  
          for (const model in usageByModel) {
            const record = usageRecords.find(r =>
              r.model === model &&
              r.date.toISOString().slice(0, 13) === hourISO
            );
            usageByModel[model].push(record ? record.tokensUsed : 0);
          }
        });
  
      } else {
   
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        const startDate = new Date(today);
  
        switch (timeframe) {
          case 'month':
            startDate.setDate(1);
            break;
          case 'year':
            startDate.setMonth(0, 1);
            break;
          case 'week':
          default:
            startDate.setDate(startDate.getDate() - 6); // Past 7 days
            break;
        }
  
        const usageRecords = await TokenUsage.find({
          user: user._id,
          date: { $gte: startDate }
        }).lean();
  
        const tempDate = new Date(startDate);
        while (tempDate <= today) {
          const dateISO = tempDate.toISOString().slice(0, 10);
          categories.push(tempDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  
          for (const model in usageByModel) {
            const record = usageRecords.find(r =>
              r.model === model &&
              r.date.toISOString().slice(0, 10) === dateISO
            );
            usageByModel[model].push(record ? record.tokensUsed : 0);
          }
  
          tempDate.setDate(tempDate.getDate() + 1);
        }
      }
  
      res.json({
        categories,
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


    const user = await User.findOne({ phoneNumber })
      .populate({
        path: 'conversations',
        populate: {
          path: 'messages',
        },
      })
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });


    const activeConversations = user.conversations.map((conv) => ({
      conversationId: conv._id,
      messageCount: conv.messages.length,
      lastUpdated: conv.updatedAt,
      llm: conv.llm,
      initialPrompt: conv.initialPrompt,
      name: conv.name,
      phone: conv.fromPhone,
      history: conv.historyDisabled,
      paused: conv.paused,
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
  

      const userData = await User.findOne({ userId});
  
      res.status(200).json(userData);
    });

module.exports = router;
