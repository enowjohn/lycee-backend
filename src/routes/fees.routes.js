const express = require('express');
const { Fee } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.get('/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const fees = await Fee.find({ student_id: req.params.studentId }).sort({ year: -1, term: -1 });
    res.json(fees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { student_id, term, year, amount, due_date } = req.body;
    const fee = await Fee.create({ student_id, term, year, amount, balance: amount, due_date });
    res.status(201).json({ id: fee._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
