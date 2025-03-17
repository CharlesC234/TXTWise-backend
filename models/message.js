const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../functions/encryption');

const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messageBody: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  isAI: { type: Boolean, default: false },
});

// Encrypt before saving
MessageSchema.pre('save', function (next) {
  if (this.isModified('messageBody')) {
    this.messageBody = encrypt(this.messageBody);
  }
  next();
});

// Decrypt after fetching
MessageSchema.methods.getDecryptedMessage = function () {
  return decrypt(this.messageBody);
};

// Auto-decrypt on JSON output
MessageSchema.set('toJSON', {
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

module.exports = mongoose.model('Message', MessageSchema);
