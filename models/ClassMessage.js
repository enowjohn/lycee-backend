const mongoose = require('mongoose');

const classMessageSchema = new mongoose.Schema({
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  class_level: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  sender_name: String,
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ClassMessage', classMessageSchema);