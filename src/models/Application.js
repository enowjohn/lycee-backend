const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const applicationSchema = new mongoose.Schema({
  application_number: { type: String, required: true, unique: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  date_of_birth: Date,
  gender: String,
  previous_school: String,
  parent_name: String,
  parent_phone: String,
  parent_email: String,
  address: String,
  stream_preference: { type: String, enum: ['english', 'french'] },
  class_level: String,
  // Uploaded passport photo, stored as a URL under /uploads.
  photo: String,
  // Fee + payment tracking. The fee is computed server-side from the class
  // level (never trusted from the client).
  fee_amount: { type: Number, default: null },
  fee_label: String,
  amount_paid: { type: Number, default: 0 },
  balance: { type: Number, default: null },
  payment_status: { type: String, default: 'unpaid', enum: ['unpaid', 'partial', 'paid'] },
  payment_method: String,
  payment_reference: String,
  receipt_number: String,
  paid_at: Date,
  status: { type: String, default: 'pending', enum: ['pending', 'under_review', 'accepted', 'rejected'] },
  submitted_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

applyJsonOptions(applicationSchema);

module.exports = mongoose.model('Application', applicationSchema);
