const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const app = express();
const cors = require('cors');
app.use(bodyParser.json());
// const router = express.Router();

// MongoDB Connection
mongoose.connect(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected ✅'))
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
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true, // Allow cookies to be sent
    })
  );

  
app.use(cookieParser());

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/chat', chatsRoutes);
app.use('/dashboard', dashboardsRoutes);
app.use('/stripe', stripeRoutes);
app.use('/twilio', twilioRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
