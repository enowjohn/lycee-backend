const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const feeSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  term: { type: String, required: true },
  year: { type: Number, required: true },
  amount: { type: Number, required: true },
  paid_amount: { type: Number, default: 0 },
  balance: Number,
  due_date: Date,
  status: { type: String, default: 'pending', enum: ['pending', 'partial', 'paid', 'overdue'] }
});

applyJsonOptions(feeSchema);

module.exports = mongoose.model('Fee', feeSchema);
