const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const notificationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['announcement', 'exam', 'event', 'grade', 'general', 'assignment'] },
  is_read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

applyJsonOptions(notificationSchema);

module.exports = mongoose.model('Notification', notificationSchema);
