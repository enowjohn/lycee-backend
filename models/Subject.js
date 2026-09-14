const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true,
    unique: true
  },
  stream: {
    type: String,
    enum: ['english', 'french', 'both']
  },
  class_level: String,
  description: String
});

module.exports = mongoose.model('Subject', subjectSchema);