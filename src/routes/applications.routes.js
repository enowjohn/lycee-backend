const express = require('express');
const { Application } = require('../models');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { first_name, last_name, date_of_birth, gender, previous_school, parent_name, parent_phone, parent_email, address, stream_preference, class_level } = req.body;
    const application_number = 'APP' + Date.now();

    const application = await Application.create({
      application_number, first_name, last_name, date_of_birth, gender, previous_school,
      parent_name, parent_phone, parent_email, address, stream_preference, class_level
    });

    res.status(201).json({ id: application._id, application_number });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
