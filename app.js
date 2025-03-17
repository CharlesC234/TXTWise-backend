const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const app = express();
const cors = require('cors');
app.use(bodyParser.json());
const cron = require('node-cron');
const User = require('./models/user'); // Adjust path if needed
// const router = express.Router();

// MongoDB Connection
mongoose.connect(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => {
    console.log('MongoDB Connected ✅');

    // ✅ Start the token reset cron job AFTER DB connects
    cron.schedule('0 0 * * *', async () => {
      try {
        console.log("🔄 Resetting all users' tokens to 7500...");

        const result = await User.updateMany({}, { dailyTokensRemaining: 7500 });

        console.log(`✅ Token reset complete for ${result.modifiedCount} users.`);
      } catch (err) {
        console.error('❌ Error resetting tokens:', err);
      }
    });

  })
  .catch(err => console.log(err));


// Routes
const authRoutes = require('./routes/auth');
const chatsRoutes = require('./routes/chats');
const dashboardsRoutes = require('./routes/dashboards');
const stripeRoutes = require('./routes/stripe');
const twilioRoutes = require('./routes/twilio');

const allowedOrigins = ['https://txtwise.io', 'http://localhost:3000'];
app.use(
    cors({
      origin: allowedOrigins,
      credentials: true, // Allow cookies to be sent
      optionsSuccessStatus: 200, // Ensure preflight requests succeed
    })
  );


app.use(cookieParser());

app.use('/stripe', stripeRoutes);

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/chat', chatsRoutes);
app.use('/dashboard', dashboardsRoutes);
app.use('/twilio', twilioRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
