const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'teacher', 'student', 'parent'] },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

applyJsonOptions(userSchema);

module.exports = mongoose.model('User', userSchema);
