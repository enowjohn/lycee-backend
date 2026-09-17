const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const studentSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Auto-linked to a parent's User account when their email matches
  // parent_email below, so a parent login can find their own child(ren).
  parent_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  student_id: { type: String, required: true, unique: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  date_of_birth: Date,
  gender: String,
  address: String,
  parent_phone: String,
  parent_email: String,
  class_level: String,
  stream: { type: String, enum: ['english', 'french'] },
  admission_date: Date,
  status: { type: String, default: 'active' }
});

applyJsonOptions(studentSchema);

module.exports = mongoose.model('Student', studentSchema);
