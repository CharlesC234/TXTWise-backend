const mongoose = require('mongoose');

const messageQueueSchema = new mongoose.Schema({
  from: String,
  to: String,
  messageBody: String,
  status: { type: String, default: 'pending' }, // pending, processing, completed, failed
  createdAt: { type: Date, default: Date.now },
});

// Create an index on the status field for efficient querying
messageQueueSchema.index({ status: 1 });

module.exports = mongoose.model('MessageQueue', messageQueueSchema);
