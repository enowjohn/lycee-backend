const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const attendanceSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VideoSession', required: true },
  join_time: Date,
  leave_time: Date,
  duration: Number,
  status: { type: String, default: 'present', enum: ['present', 'absent', 'late'] }
});

applyJsonOptions(attendanceSchema);

module.exports = mongoose.model('Attendance', attendanceSchema);
