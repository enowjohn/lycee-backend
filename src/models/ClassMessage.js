const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const classMessageSchema = new mongoose.Schema({
  sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  class_level: { type: String, required: true },
  message: { type: String, required: true },
  sender_name: String,
  created_at: { type: Date, default: Date.now }
});

applyJsonOptions(classMessageSchema);

module.exports = mongoose.model('ClassMessage', classMessageSchema);
