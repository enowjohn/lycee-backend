const mongoose = require('mongoose');

const assignmentSubmissionSchema = new mongoose.Schema({
  assignment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true
  },
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  submission_text: String,
  file_path: String,
  submitted_at: {
    type: Date,
    default: Date.now
  },
  marks: Number,
  grade: String,
  feedback: String,
  status: {
    type: String,
    default: 'submitted',
    enum: ['submitted', 'graded', 'late', 'rejected', 'approved', 'failed']
  }
});

module.exports = mongoose.model('AssignmentSubmission', assignmentSubmissionSchema);