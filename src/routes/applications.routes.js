const express = require('express');
const { Application } = require('../models');
const upload = require('../middleware/upload');

const router = express.Router();

// Official fee schedule (XAF). Kept server-side so the amount a client
// sends can never change what is actually owed.
const FEE_TABLE = {
  junior: { amount: 42700, label: 'Form 1 - Form 5' },
  senior: { amount: 47300, label: 'Lower Sixth - Upper Sixth (LSS-USS)' }
};

function computeFeeForClass(classLevel) {
  const level = String(classLevel || '').trim().toLowerCase();
  if (!level) return null;

  // Lower/Upper Sixth (and the francophone equivalents) are the senior tier.
  if (/sixth|lss|uss|premiere|1ere|terminale/.test(level)) return FEE_TABLE.senior;

  // Form 1-5 and the equivalent francophone classes.
  if (/form|class|5e|4e|3e|2e|secondary|1st|2nd|3rd|4th|5th/.test(level)) return FEE_TABLE.junior;

  return null;
}

function photoUrl(file) {
  return file ? `/uploads/${file.filename}` : null;
}

function paymentSummary(application) {
  return {
    id: application._id,
    application_number: application.application_number,
    fee_amount: application.fee_amount,
    fee_label: application.fee_label,
    amount_paid: application.amount_paid || 0,
    balance: application.balance,
    payment_status: application.payment_status || 'unpaid',
    payment_method: application.payment_method,
    payment_reference: application.payment_reference,
    receipt_number: application.receipt_number,
    paid_at: application.paid_at
  };
}

// ---- Submit an application ----
// Multipart because of the optional passport photo (multer populates
// req.body for the text fields as well).
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    const {
      first_name, last_name, date_of_birth, gender, previous_school,
      parent_name, parent_phone, parent_email, address, stream_preference,
      class_level
    } = req.body;

    const fee = computeFeeForClass(class_level);
    if (!fee) {
      return res.status(400).json({
        error: 'Unknown class level. Choose Form 1-5 or Lower/Upper Sixth.'
      });
    }

    const amountPaid = Math.max(Number(req.body.amount_paid) || 0, 0);
    const balance = Math.max(fee.amount - amountPaid, 0);
    const paymentStatus = balance <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

    const application_number = 'APP' + Date.now();
    const application = await Application.create({
      application_number,
      first_name,
      last_name,
      date_of_birth,
      gender,
      previous_school,
      parent_name,
      parent_phone,
      parent_email,
      address,
      stream_preference,
      class_level,
      photo: photoUrl(req.file),
      fee_amount: fee.amount,
      fee_label: fee.label,
      amount_paid: amountPaid,
      balance,
      payment_status: paymentStatus
    });

    res.status(201).json({
      ...paymentSummary(application),
      photo_url: application.photo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Fee receipt (JSON; the printable PDF is generated client-side) ----
router.get('/:number/receipt', async (req, res) => {
  try {
    const application = await Application.findOne({ application_number: req.params.number });
    if (!application) return res.status(404).json({ error: 'Application not found' });

    res.json({
      ...paymentSummary(application),
      first_name: application.first_name,
      last_name: application.last_name,
      class_level: application.class_level,
      parent_name: application.parent_name,
      parent_phone: application.parent_phone,
      parent_email: application.parent_email,
      photo_url: application.photo,
      status: application.status,
      submitted_at: application.submitted_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Record a fee payment (cash / bank / mobile money / other) ----
// No external gateway: a bursar or parent records the payment and the
// receipt is issued. Amounts are validated and totalled server-side.
router.post('/:number/pay', async (req, res) => {
  try {
    const application = await Application.findOne({ application_number: req.params.number });
    if (!application) return res.status(404).json({ error: 'Application not found' });

    // Applications created before fees were stored can still be paid.
    if (!application.fee_amount) {
      const fee = computeFeeForClass(application.class_level);
      if (!fee) {
        return res.status(400).json({ error: 'This application has no fee on record (unknown class level).' });
      }
      application.fee_amount = fee.amount;
      application.fee_label = fee.label;
    }

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Enter a valid payment amount.' });
    }

    const totalPaid = (Number(application.amount_paid) || 0) + amount;
    const balance = Math.max(application.fee_amount - totalPaid, 0);
    const now = new Date();

    application.amount_paid = totalPaid;
    application.balance = balance;
    application.payment_status = balance <= 0 ? 'paid' : 'partial';
    application.payment_method = req.body.method || 'other';
    application.payment_reference = req.body.reference || '';
    application.receipt_number = application.receipt_number || 'RCP' + Date.now();
    application.paid_at = now;
    application.updated_at = now;

    await application.save();
    res.json(paymentSummary(application));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Withdraw/delete an application (unpaid only) ----
router.delete('/:number', async (req, res) => {
  try {
    const application = await Application.findOne({ application_number: req.params.number });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.payment_status === 'paid') {
      return res.status(400).json({
        error: 'This application has a recorded payment and cannot be deleted. Contact the school office.'
      });
    }

    await Application.deleteOne({ _id: application._id });
    res.json({ message: 'Application deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Check an application ----
router.get('/:number', async (req, res) => {
  try {
    const application = await Application.findOne({ application_number: req.params.number });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
