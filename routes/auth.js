const express = require('express');
const router = express.Router();
const tempClient = require('../functions/tempClient'); // Redis utility functions
const twilio = require('twilio');
require('dotenv').config();
const { verifyToken } = require('../functions/verifyToken');
const { generateToken } = require('../functions/generateToken');
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const sendSms = require('../functions/sendSMS');


router.get('/validate', async (req, res) => {
  try {
      const token = req.cookies.token; // Extract token from HTTP-only cookie

      if (!token) {
          return res.status(401).json({ message: 'Unauthorized: No token provided' });
      }

      // Verify JWT
      jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
          if (err) {
              return res.status(401).json({ message: 'Unauthorized: Invalid token' });
          }

          // Find user based on decoded phone number
          const user = await User.findOne({ phoneNumber: decoded.phoneNumber });
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



router.post(
    '/send', async function (req, res){
      const { phoneNumber } = req.body;
  
      if (!phoneNumber) {
        return res.status(400).json({ message: 'Phone number required.' });
      }

      // Generate a 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  
      // Save phone number and verification code temporarily in Redis
      await tempClient.saveTemporarySignupData(phoneNumber, verificationCode);
  
      const response = await sendSms(
        `Your TXTWise verification code is: ${verificationCode}`,
        process.env.SIGNALWIRE_PHONE_NUMBER,
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

        if (!phoneNumber || !verificationCode) {
          return res.status(400).json({ message: 'Phone number and verification code are required.' });
        }

        try {
          // Retrieve stored data from Redis (OTP verification)
          const storedData = await tempClient.getTemporarySignupData(phoneNumber);

          if (!storedData) {
            return res.status(400).json({ message: 'Phone number not found or verification expired.' });
          }

          console.log(storedData);

          if (storedData !== verificationCode) {
            return res.status(400).json({ message: 'Invalid verification code.' });
          }

          // Check if user already exists
          let user = await User.findOne({ phoneNumber });

          if (!user) {
            // Create new user with default values
            user = new User({
              phoneNumber: phoneNumber,
              name: '',
              subscriptionStatus: 'free',
              dailyTokensRemaining: 5000,
              conversations: [],
              messages: [],
              createdAt: new Date(),
            });

            await user.save();
          }

          // Generate JWT
          const token = generateToken(user.phoneNumber);

          // Set JWT in HTTP-Only Cookie
          res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          });

          // Send response with token
          res.status(200).json({ message: 'Phone number verified successfully.', token });
        } catch (error) {
          console.error('Error verifying phone number:', error);
          res.status(500).json({ message: 'Internal server error' });
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
