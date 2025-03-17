const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../functions/encryption');

const messageQueueSchema = new mongoose.Schema({
  from: String,
  to: String,
  messageBody: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  priority: { type: Number, default: 1 },
});

messageQueueSchema.index({ status: 1 });

// Encrypt before save
messageQueueSchema.pre('save', function (next) {
  if (this.isModified('messageBody')) {
    this.messageBody = encrypt(this.messageBody);
  }
  next();
});

// Decrypt after fetching
messageQueueSchema.methods.getDecryptedMessage = function () {
  return decrypt(this.messageBody);
};

// Auto-decrypt on JSON output
messageQueueSchema.set('toJSON', {
  transform: function (doc, ret) {
    if (ret.messageBody) {
      try {
        ret.messageBody = decrypt(ret.messageBody);
      } catch (err) {
        ret.messageBody = 'DECRYPTION_ERROR';
      }
    }
    return ret;
  },
});

module.exports = mongoose.model('MessageQueue', messageQueueSchema);
