const mongoose = require('mongoose');

const videoSessionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  teacher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true
  },
  subject_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  },
  class_level: String,
  scheduled_date: {
    type: Date,
    required: true
  },
  duration: Number,
  meeting_id: {
    type: String,
    required: true,
    unique: true
  },
  recording_url: String,
  status: {
    type: String,
    default: 'scheduled',
    enum: ['scheduled', 'live', 'completed', 'cancelled']
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('VideoSession', videoSessionSchema);