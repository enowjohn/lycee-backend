const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const markSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  term: { type: String, required: true },
  year: { type: Number, required: true },
  assignment_marks: Number,
  mid_term_marks: Number,
  final_marks: Number,
  total_marks: Number,
  grade: String,
  comments: String,
  created_at: { type: Date, default: Date.now }
});

applyJsonOptions(markSchema);

module.exports = mongoose.model('Mark', markSchema);
