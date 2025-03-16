const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();
const MessageQueue = require('../models/queue');
const sendSms = require('../functions/sendSMS');
const processQueue = require('../functions/processQueue');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const Message = require('../models/message'); // Ensure this is imported at the top

const router = express.Router();

// Middleware: Parse URL-encoded Twilio data
router.use(bodyParser.urlencoded({ extended: false }));

// Define AI Model Keywords
const AI_KEYWORDS = ["CHATGPT", "GROK", "GEMINI", "CLAUDE", "DEEPSEEK"];

// Webhook for Incoming SMS
router.post('/webhook', async (req, res) => {
    const from = req.body.From;
    const to = req.body.To;
    let incomingMessage = req.body.Body.trim().toUpperCase(); // Normalize input

    console.log(`Incoming message from ${from} to ${to}: ${incomingMessage}`);

    // Check if the sender is a registered user
    const user = await User.findOne({ phoneNumber: from });

    if (!user) {
        console.log(`Unauthorized number: ${from}. Sending registration link.`);
        await sendSms("You are not registered. Please create an account at https://txtwise.io/login to use this service.", to, from);
        return res.status(200).send('<Response></Response>'); // Stop further processing
    }

    // Check if the user has any active conversations
    let conversation = await Conversation.findOne({ user: user._id }).sort({ updatedAt: -1 });

    if (!conversation) {
        console.log(`No active conversations for ${from}.`);
        await sendSms("You do not have any active conversations. Please log into your account at https://txtwise.io/login and initialize a conversation to use this service.", to, from);
        return res.status(200).send('<Response></Response>'); // Stop further processing
    }

    // Handle **Special Keywords** for user account info
    switch (incomingMessage) {
        case "STATUS":
            const statusMessage = `You are currently using TXTWise.\n\n Your Subscription: ${user.subscriptionStatus.toUpperCase()}\n Tokens Remaining: ${user.dailyTokensRemaining} / 35,000\n Current AI Model: ${conversation.llm.toUpperCase()}\n\nManage your account at:`;
            await sendSms(statusMessage, to, from);
            return res.status(200).send('<Response></Response>');

        case "HELP":
            const helpMessage = `You have replied “HELP”\n\nReply with STOP, CANCEL, END, QUIT, UNSUBSCRIBE, or STOPALL to opt out.\nMsg & Data Rates May Apply.\n\nTo manage your account, visit \nTo switch AI models, text: "CHATGPT", "GEMINI", "DEEPSEEK", "GROK", "CLAUDE".\nTo delete your account, go to Settings > Pause or Delete Account.\nNeed help? Contact us at txtwiseio@gmail.com.\n\nTXTWise by Launchwards, LLC\n7661 Canterbury Cir, Lakeland, FL`;
            await sendSms(helpMessage, to, from);
            return res.status(200).send('<Response></Response>');

        case "SUBSCRIPTION":
            const subscriptionMessage = `Your current subscription level: ${user.subscriptionStatus.toUpperCase()}.\n\nTo manage your subscription, go to: and log in with your phone number.`;
            await sendSms(subscriptionMessage, to, from);
            return res.status(200).send('<Response></Response>');

        case "AI":
            const aiMessage = `You are currently using ${conversation.llm.toUpperCase()}.\n\nTo switch AI models in this chat, text one of these keywords:\n- "CHATGPT"\n- "GEMINI"\n- "DEEPSEEK"\n- "GROK"\n- "CLAUDE"`;
            await sendSms(aiMessage, to, from);
            return res.status(200).send('<Response></Response>');

        case "TOKENS":
            const tokensMessage = `You have ${user.dailyTokensRemaining} out of 25,000 tokens remaining today.\n\nTo upgrade to unlimited tokens, subscribe at: and log in with your phone number.`;
            await sendSms(tokensMessage, to, from);
            return res.status(200).send('<Response></Response>');
    }

    // Check if the message starts with an AI model keyword (for switching models)
    const words = incomingMessage.split(" ");
    if (AI_KEYWORDS.includes(words[0])) {
        const newLlm = words[0].toLowerCase();
        console.log(`Switching LLM to: ${newLlm} for ${from}`);
    
        // Update conversation with new AI model
        conversation.llm = newLlm;
        await conversation.save();
    
        // Log the switch in the conversation as a system message
        const switchMessage = await Message.create({
            conversationId: conversation._id,
            sender: user._id, // Optional: You can use a dedicated "system" ID or keep the user
            messageBody: `You switched AI models to ${newLlm.toUpperCase()} for this conversation.`,
            isAI: false,
        });
    
        conversation.messages.push(switchMessage._id);
        await conversation.save();
    
        if (words.length === 1) {
            // Only AI keyword provided — acknowledge switch
            await sendSms(`You have switched to ${newLlm.toUpperCase()} for this conversation.`, to, from);
            return res.status(200).send('<Response></Response>');
        } else {
            // Proceed with trimmed message
            incomingMessage = words.slice(1).join(" ");
        }
    }


    if (user.subscriptionStatus === 'free' && user.dailyTokensRemaining <= 0) {
        await sendSms(
            "Daily token limit reached, you have used all 25,000 tokens for today. Tokens reset to 25,000 at midnight, you can also upgrade to unlimited tokens for $5/month at txtwise.io/pricing.",
            to,
            from
        );
        return res.status(200).send('<Response></Response>');
    }
    

    // Add message to queue for processing
    await MessageQueue.create({ from, to, messageBody: incomingMessage });
    processQueue();

    res.status(200).send('<Response></Response>'); // Twilio requires an immediate response
});

module.exports = router;
