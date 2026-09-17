const express = require('express');
const { Mark } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

function flattenMark(mark) {
  const json = mark.toJSON();
  const subject = json.subject_id;
  const teacher = json.teacher_id;
  return {
    ...json,
    subject_id: subject && subject.id ? subject.id : subject,
    subject_name: subject && subject.name,
    subject_code: subject && subject.code,
    teacher_id: teacher && teacher.id ? teacher.id : teacher,
    teacher_first_name: teacher && teacher.first_name,
    teacher_last_name: teacher && teacher.last_name
  };
}

router.get('/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { term, year } = req.query;
    const filter = { student_id: req.params.studentId };
    if (term) filter.term = term;
    if (year) filter.year = year;

    const marks = await Mark.find(filter)
      .populate('subject_id', 'name code')
      .populate('teacher_id', 'first_name last_name');

    res.json(marks.map(flattenMark));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { student_id, subject_id, teacher_id, term, year, assignment_marks, mid_term_marks, final_marks, comments } = req.body;

    const total_marks = (Number(assignment_marks) || 0) + (Number(mid_term_marks) || 0) + (Number(final_marks) || 0);
    let grade = 'F';

    if (total_marks >= 80) grade = 'A';
    else if (total_marks >= 70) grade = 'B';
    else if (total_marks >= 60) grade = 'C';
    else if (total_marks >= 50) grade = 'D';
    else if (total_marks >= 40) grade = 'E';

    const mark = await Mark.create({
      student_id, subject_id, teacher_id, term, year,
      assignment_marks, mid_term_marks, final_marks, total_marks, grade, comments
    });

    res.status(201).json({ id: mark._id, total_marks, grade });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
