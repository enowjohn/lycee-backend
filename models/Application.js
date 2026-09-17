const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  application_number: {
    type: String,
    required: true,
    unique: true
  },
  first_name: {
    type: String,
    required: true
  },
  last_name: {
    type: String,
    required: true
  },
  date_of_birth: Date,
  gender: String,
  previous_school: String,
  parent_name: String,
  parent_phone: String,
  parent_email: String,
  address: String,
  stream_preference: {
    type: String,
    enum: ['english', 'french']
  },
  class_level: String,
  photo: String,
  amount_paid: Number,
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'under_review', 'accepted', 'rejected']
  },
  submitted_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Application', applicationSchema);