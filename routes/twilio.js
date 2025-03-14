const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();
const MessageQueue = require('../models/queue');
const sendSms = require('../functions/sendSMS');
const processQueue = require('../functions/processQueue');
const User = require('../models/user');

const router = express.Router();

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

        await sendSms("You are not registered. Please create an account at https://txtwise.io/login to use this service.", to, from);
  
        return res.status(200).send('<Response></Response>'); // Stop further processing
      }


      if (user.conversations.length <= 0) {
        console.log(`No active conversations: ${from}.`);
    
        await sendSms("You do not have any active conversations. Please log into your account at https://txtwise.io/login and initialize a conversation to use this service.",
         to, from);
  
        return res.status(200).send('<Response></Response>'); // Stop further processing
      }

      await MessageQueue.create({ from, to, messageBody: incomingMessage });
      processQueue();

  res.status(200).send('<Response></Response>'); // Twilio requires an immediate response
});

module.exports = router;
