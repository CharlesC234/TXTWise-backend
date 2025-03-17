const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Subscription = require('../models/subscription');
const User = require('../models/user');
require('dotenv').config();
const router = express.Router();

// Stripe Webhook Secret (set in your Stripe Dashboard)
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

router.post('/create-checkout-session', async (req, res) => {
  const { userId, planType } = req.body; // From frontend

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: process.env.PRICE_ID, // Monthly or yearly price ID
        quantity: 1,
      },
    ],
    metadata: {
      userId,       // 👈 REQUIRED for your webhook to find the user
      planType,     // 👈 'monthly' or 'yearly' — used for Subscription model
    },
    success_url: 'https://txtwise.io/dashboard',
    cancel_url: 'https://txtwise.io/dashboard',
  });

  res.json({ sessionId: session.id });
});

// Middleware: Raw body parser for Stripe Webhook
router.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle specific event types from Stripe
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;

      // Extract metadata (userId passed during checkout)
      const userId = session.metadata.userId;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      try {
        // Update or Create Subscription in MongoDB
        const subscription = await Subscription.findOneAndUpdate(
          { userId },
          {
            userId,
            planType: session.metadata.planType, // Example: 'monthly' or 'yearly'
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            status: 'active',
            startDate: new Date(),
            endDate: null, // Reset on new subscription
          },
          { upsert: true, new: true }
        );

        // Update User's Subscription Status
        await User.findByIdAndUpdate(userId, { subscriptionStatus: 'premium' });

        console.log(`Subscription activated for user ${userId}`);
        res.status(200).send({ received: true });
      } catch (err) {
        console.error('Error updating subscription:', err);
        res.status(500).send('Internal Server Error');
      }
      break;
    }

    case 'invoice.payment_failed': {
      const session = event.data.object;
      const customerId = session.customer;

      // Find user by Stripe Customer ID and downgrade plan
      const subscription = await Subscription.findOneAndUpdate(
        { stripeCustomerId: customerId },
        { status: 'past_due' }
      );

      if (subscription) {
        await User.findByIdAndUpdate(subscription.userId, { subscriptionStatus: 'free' });
        console.log(`Payment failed. Downgraded user ${subscription.userId}`);
      }
      res.status(200).send({ received: true });
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      // Find and update user subscription
      const dbSubscription = await Subscription.findOneAndUpdate(
        { stripeCustomerId: customerId },
        { status: 'canceled', endDate: new Date() }
      );

      if (dbSubscription) {
        await User.findByIdAndUpdate(dbSubscription.userId, { subscriptionStatus: 'free' });
        console.log(`Subscription canceled for user ${dbSubscription.userId}`);
      }
      res.status(200).send({ received: true });
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      const customerId = charge.customer;

      const dbSubscription = await Subscription.findOneAndUpdate(
        { stripeCustomerId: customerId },
        { status: 'canceled', endDate: new Date() }
      );

      if (dbSubscription) {
        await User.findByIdAndUpdate(dbSubscription.userId, { subscriptionStatus: 'free' });
        console.log(`Subscription refunded for user ${dbSubscription.userId}`);
      }
      res.status(200).send({ received: true });
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
      res.status(200).send({ received: true });
  }
});

module.exports = router;
