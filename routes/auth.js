const express = require('express');
const router = express.Router();
const tempClient = require('../functions/tempClient'); 
const twilio = require('twilio');
require('dotenv').config();
const { verifyToken } = require('../functions/verifyToken');
const { generateToken } = require('../functions/generateToken');
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const sendSms = require('../functions/sendSMS');
const Message = require('../models/message');
const Conversation = require('../models/conversation');


router.get('/validate', async (req, res) => {
  try {
      const cookieToken = req.cookies?.token;
      const headerToken = req.headers.authorization?.split(' ')[1]; // 'Bearer tokenHere'

      const token = cookieToken || headerToken; // Prefer cookie, fallback to header

      console.log("Token used:", token);

      if (!token) {
          return res.status(401).json({ message: 'Unauthorized: No token provided' });
      }

      jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
          if (err) {
              return res.status(401).json({ message: 'Unauthorized: Invalid token' });
          }

          const user = await User.findOne({ phoneNumber: decoded.id });
          if (!user) {
              return res.status(401).json({ message: 'Unauthorized: User not found' });
          }

          res.status(200).json({ authenticated: true, user });
      });
  } catch (error) {
      console.error('Error validating JWT:', error);
      res.status(500).json({ message: 'Internal Server Error' });
  }
});




router.post('/send', async function (req, res) {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ message: 'Phone number required.' });
  }


  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

  await tempClient.saveTemporarySignupData(phoneNumber, verificationCode);

  const authNumbers = [
    process.env.SIGNALWIRE_PHONE_NUMBER_AUTH6,
    process.env.SIGNALWIRE_PHONE_NUMBER_AUTH7
  ];

  // Randomly select one of the two numbers
  const selectedAuthNumber = authNumbers[Math.floor(Math.random() * authNumbers.length)];

  const response = await sendSms(
    `Your TXTWise verification code is: ${verificationCode}`,
    selectedAuthNumber,  
    phoneNumber
  );

  if (!response.success) {
    return res.status(500).json({ message: response.message });
  }

  res.status(200).json({ message: 'Verification code sent to phone number.' });
});



      // Verify Route
      router.post('/verify', async (req, res) => {
        const { phoneNumber, verificationCode } = req.body;

        console.log("Phone " + phoneNumber);

        if (!phoneNumber || !verificationCode) {
          return res.status(400).json({ message: 'Phone number and verification code are required.' });
        }

        try {

          const storedData = await tempClient.getTemporarySignupData(phoneNumber);

          if (!storedData) {
            return res.status(400).json({ message: 'Phone number not found or verification expired.' });
          }

          console.log(storedData);

          if (storedData !== verificationCode) {
            return res.status(400).json({ message: 'Invalid verification code.' });
          }

          let user = await User.findOne({ phoneNumber });

          if (!user) {
            user = new User({
              phoneNumber: phoneNumber,
              name: '',
              subscriptionStatus: 'free',
              dailyTokensRemaining: 7500,
              conversations: [],
              messages: [],
              createdAt: new Date(),
            });

            await user.save();
          }

          const token = generateToken(user.phoneNumber);

     
          res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'None',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            overwrite: true,
          });

          console.log("token" + token)

  
          res.status(200).json({ message: 'Phone number verified successfully.'});
        } catch (error) {
          console.error('Error verifying phone number:', error);
          res.status(500).json({ message: 'Internal server error' });
        }
      });


      router.delete('/delete-account', verifyToken, async (req, res) => {
        try {
          const phoneNumber = req.userId;
          const user = await User.findOne({ phoneNumber });
      
          if (!user) {
            return res.status(404).json({ error: 'User not found' });
          }
      
          const userId = user._id;
      
     
          const conversations = await Conversation.find({ user: userId });
          const conversationIds = conversations.map(c => c._id);
      
       
          await Message.deleteMany({ conversationId: { $in: conversationIds } });
      
        
          await Conversation.deleteMany({ _id: { $in: conversationIds } });
      
    
          await User.deleteOne({ _id: userId });
      
          res.status(200).json({ message: 'User account and all associated data have been deleted.' });
        } catch (err) {
          console.error('Error deleting user:', err);
          res.status(500).json({ error: 'Internal server error.' });
        }
      });



  /**
 * Logout Route
 */
router.post('/logout', async function (req, res){
  res.clearCookie('token');
  res.status(200).json({ message: 'Logged out successfully' });
});

module.exports = router;
