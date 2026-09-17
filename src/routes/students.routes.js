const express = require('express');
const { Student } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, stream, class_level } = req.query;
    const filter = { status: 'active' };

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ first_name: regex }, { last_name: regex }, { student_id: regex }];
    }
    if (stream) filter.stream = stream;
    if (class_level) filter.class_level = class_level;

    const students = await Student.find(filter);
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { student_id, first_name, last_name, date_of_birth, gender, address, parent_phone, parent_email, class_level, stream, admission_date } = req.body;

    const student = await Student.create({
      student_id, first_name, last_name, date_of_birth, gender, address,
      parent_phone, parent_email, class_level, stream, admission_date
    });

    res.status(201).json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, date_of_birth, gender, address, parent_phone, parent_email, class_level, stream, status } = req.body;

    await Student.findByIdAndUpdate(req.params.id, {
      first_name, last_name, date_of_birth, gender, address,
      parent_phone, parent_email, class_level, stream, status
    });

    res.json({ message: 'Student updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
