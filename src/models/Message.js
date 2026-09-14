const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const messageSchema = new mongoose.Schema({
  sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // NOTE: not present in the original SQLite table (the old POST /api/messages
  // route inserted it anyway and would 500 in production); added properly here.
  subject: String,
  message: { type: String, required: true },
  sender_name: String,
  is_read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

applyJsonOptions(messageSchema);

module.exports = mongoose.model('Message', messageSchema);
