const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  teacher_id: {
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
  subject: {
    type: String,
    required: true
  },
  department: String,
  phone: String,
  email: String,
  qualification: String,
  photo: String,
  hire_date: Date,
  status: {
    type: String,
    default: 'active'
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

teacherSchema.virtual('full_name').get(function() {
  return `${this.first_name} ${this.last_name}`;
});

module.exports = mongoose.model('Teacher', teacherSchema);