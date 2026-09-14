const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  event_date: { type: Date, required: true },
  event_time: String,
  location: String,
  type: { type: String, enum: ['academic', 'sports', 'cultural', 'meeting', 'exam'] },
  created_at: { type: Date, default: Date.now }
});

applyJsonOptions(eventSchema);

module.exports = mongoose.model('Event', eventSchema);
