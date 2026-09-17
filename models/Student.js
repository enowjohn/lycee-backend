const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  student_id: {
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
  address: String,
  parent_phone: String,
  parent_email: String,
  class_level: String,
  stream: String,
  admission_date: Date,
  status: {
    type: String,
    default: 'active'
  }
});

module.exports = mongoose.model('Student', studentSchema);