const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();
const MessageQueue = require('../models/queue');
const sendSms = require('../functions/sendSMS');
const processQueue = require('../functions/processQueue');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const Message = require('../models/message');

const router = express.Router();


router.use(bodyParser.urlencoded({ extended: false }));

const AI_KEYWORDS = ["CHATGPT", "GROK", "GEMINI", "CLAUDE", "DEEPSEEK"];

router.post('/webhook', async (req, res) => {
    console.log(`webhook called: ${req.body.From} to ${req.body.To}: ${req.body.Body}`);
    const from = req.body.From;
    const to = req.body.To;
    let incomingMessage = req.body.Body.trim().toUpperCase();

    console.log(`Incoming message from ${from} to ${to}: ${incomingMessage}`);

    const user = await User.findOne({ phoneNumber: from });

    if (!user) {
        console.log(`Unauthorized number: ${from}. Sending registration link.`);
        await sendSms("You are not registered. Please create an account at https://txtwise.io/login to use this service.", to, from);
        return res.status(200).send('<Response></Response>');
    }

    const conversation = await Conversation.findOne({ 
        user: user._id,
        fromPhone: to  
    }).sort({ updatedAt: -1 });

    if (!conversation) {
        console.log(`No conversation found for user ${user.phoneNumber} with phone ${to}.`);
        await sendSms(
            "No conversation found with this number. Please log in at https://txtwise.io/login and create a new chat.",
            to,
            from
        );
    return res.status(200).send('<Response></Response>');
}

    if(conversation.paused){
        return res.status(200).send('<Response></Response>');
    }

    const messageNonCase = incomingMessage.toUpperCase(); 


    switch (messageNonCase) {
        case "STATUS":
            const statusMessage = `You are currently using TXTWise.\n\n Your Subscription: ${user.subscriptionStatus.toUpperCase()}\n Tokens Remaining: ${user.dailyTokensRemaining} / 7,500 (Daily)\n Current AI Model: ${conversation.llm.toUpperCase()}\n\nManage your account at: txtwise(io)`;
            await sendSms(statusMessage, to, from);
            return res.status(200).send('<Response></Response>');

        case "HELP":
            const helpMessage = `You have replied “HELP”\n\nReply with STOP, CANCEL, END, QUIT, UNSUBSCRIBE, or STOPALL to opt out.\nMsg & Data Rates May Apply.\n\nTo manage your account, visit txtwise(io)\nTo switch AI models, text: "CHATGPT", "GEMINI", "DEEPSEEK", "GROK", "CLAUDE".\nTo delete your account, go to txtwise(io), and click your phone number in the top right corner, then hit "Fully Delete Account".\nNeed help? Contact us at txtwiseio@gmail.com.\n\nTXTWise by Launchwards, LLC\n Lakeland, FL`;
            await sendSms(helpMessage, to, from);
            return res.status(200).send('<Response></Response>');

        case "SUBSCRIPTION":
            const subscriptionMessage = `Your current subscription level: ${user.subscriptionStatus.toUpperCase()}.\n\nTo manage your subscription, go to: txtwise(io) and log in with your phone number.`;
            await sendSms(subscriptionMessage, to, from);
            return res.status(200).send('<Response></Response>');

        case "AI":
            const aiMessage = `You are currently using ${conversation.llm.toUpperCase()}.\n\nTo switch AI models in this chat, text one of these keywords:\n- "CHATGPT"\n- "GEMINI"\n- "DEEPSEEK"\n- "GROK"\n- "CLAUDE"`;
            await sendSms(aiMessage, to, from);
            return res.status(200).send('<Response></Response>');

        case "TOKENS":
            const tokensMessage = `You have ${user.dailyTokensRemaining} out of 7,500 tokens remaining today.\n\nTo upgrade to unlimited tokens, subscribe at: txtwise(io) and log in with your phone number.`;
            await sendSms(tokensMessage, to, from);
            return res.status(200).send('<Response></Response>');
        
        case "KEYWORDS":
            const keywordsMessage = `Here are some useful keywords:\n\n
            "STATUS"\n
            "HELP"\n
            "TOKENS"\n
            "AI"\n
            "SUBSCRIPTION"\n
            "GROK", "CHATGPT", "GEMINI", "DEEPSEEK", "CLAUDE"`;
            await sendSms(keywordsMessage, to, from);
            return res.status(200).send('<Response></Response>');

    }

    const words = incomingMessage.split(" ");
    if (AI_KEYWORDS.includes(words[0])) {
        const newLlm = words[0].toLowerCase();
        console.log(`Switching LLM to: ${newLlm} for ${from}`);
    

        conversation.llm = newLlm;
        await conversation.save();
    
        const switchMessage = await Message.create({
            conversationId: conversation._id,
            sender: user._id,
            messageBody: `You switched AI models to ${newLlm.toUpperCase()} for this conversation.`,
            isAI: false,
        });
    
        conversation.messages.push(switchMessage._id);
        await conversation.save();
    
        if (words.length === 1) {

            await sendSms(`You have switched to ${newLlm.toUpperCase()} for this conversation.`, to, from);
            return res.status(200).send('<Response></Response>');
        } else {
            incomingMessage = words.slice(1).join(" ");
        }
    }


    if (user.subscriptionStatus === 'free' && user.dailyTokensRemaining <= 0) {
        await sendSms(
            "Daily token limit reached, you have used all 7,500 tokens for today. Tokens reset to 7,500 at midnight, you can also upgrade to unlimited tokens for $5/month at txtwise.io/pricing.",
            to,
            from
        );
        return res.status(200).send('<Response></Response>');
    }
    

    // Add message to queue for processing
    await MessageQueue.create({ 
        from, 
        to, 
        messageBody: incomingMessage, 
        priority: user.subscriptionStatus === 'premium' ? 0 : 1 
      });
      processQueue();
    res.status(200).send('<Response></Response>');
});

module.exports = router;
