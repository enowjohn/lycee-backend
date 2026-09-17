const express = require('express');
const { Student, User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// NOTE: '/me' and '/my-children' must stay registered before any '/:id'
// route so they aren't swallowed by the param route.

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findOne({ user_id: req.user.id });
    if (!student) return res.status(404).json({ error: 'Student profile not found' });
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/my-children', authenticateToken, requireRole('parent'), async (req, res) => {
  try {
    const children = await Student.find({ parent_user_id: req.user.id });
    res.json(children);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

    // Auto-link to a parent account whose email matches, so that parent
    // can see this child via GET /my-children without any manual linking step.
    let parent_user_id;
    if (parent_email) {
      const parentUser = await User.findOne({ email: parent_email, role: 'parent' });
      if (parentUser) parent_user_id = parentUser._id;
    }

    const student = await Student.create({
      user_id: req.user.id,
      parent_user_id,
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

    let update = {
      first_name, last_name, date_of_birth, gender, address,
      parent_phone, parent_email, class_level, stream, status
    };

    if (parent_email) {
      const parentUser = await User.findOne({ email: parent_email, role: 'parent' });
      update.parent_user_id = parentUser ? parentUser._id : undefined;
    }

    await Student.findByIdAndUpdate(req.params.id, update);
    res.json({ message: 'Student updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
