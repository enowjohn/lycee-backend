const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const assignmentSchema = new mongoose.Schema({
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  teacher_name: String,
  subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  subject_name: String,
  class_level: String,
  stream: { type: String, enum: ['science', 'art', 'both'] },
  title: { type: String, required: true },
  description: String,
  file_path: String,
  due_date: Date,
  total_marks: { type: Number, default: 100 },
  created_at: { type: Date, default: Date.now }
});

applyJsonOptions(assignmentSchema);

module.exports = mongoose.model('Assignment', assignmentSchema);
