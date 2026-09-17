const express = require('express');
const { Teacher } = require('../models');
const authenticateToken = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const teachers = await Teacher.find({ status: 'active' });
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const { teacher_id, first_name, last_name, subject, department, phone, email, qualification, hire_date } = req.body;
    const photo = req.file ? req.file.filename : null;

    const teacher = await Teacher.create({
      teacher_id, first_name, last_name, subject, department, phone, email, qualification, photo, hire_date
    });

    res.status(201).json(teacher);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
