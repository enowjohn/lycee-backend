const express = require('express');
const { Assignment, AssignmentSubmission, Student, Teacher, Notification } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

function flattenAssignment(assignment) {
  const json = assignment.toJSON();
  const subject = json.subject_id;
  const teacher = json.teacher_id;
  return {
    ...json,
    subject_id: subject && subject.id ? subject.id : subject,
    subject_name: (subject && subject.name) || json.subject_name,
    teacher_id: teacher && teacher.id ? teacher.id : teacher,
    teacher_first_name: teacher && teacher.first_name,
    teacher_last_name: teacher && teacher.last_name
  };
}

// NOTE: '/teacher' must stay registered before '/:id' so it isn't
// swallowed by the param route (preserves original ordering).
router.get('/', async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .sort({ created_at: -1 })
      .populate('subject_id', 'name')
      .populate('teacher_id', 'first_name last_name');

    res.json(assignments.map(flattenAssignment));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/teacher', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ user_id: req.user.id });
    if (!teacher) return res.json([]);

    const assignments = await Assignment.find({ teacher_id: teacher._id })
      .sort({ created_at: -1 })
      .populate('subject_id', 'name');

    const withCounts = await Promise.all(assignments.map(async (assignment) => {
      const submission_count = await AssignmentSubmission.countDocuments({ assignment_id: assignment._id });
      const json = assignment.toJSON();
      const subject = json.subject_id;
      return {
        ...json,
        subject_id: subject && subject.id ? subject.id : subject,
        subject_name: (subject && subject.name) || json.subject_name,
        submission_count
      };
    }));

    res.json(withCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('subject_id', 'name')
      .populate('teacher_id', 'first_name last_name');

    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    res.json(flattenAssignment(assignment));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, requireRole('teacher', 'admin'), upload.single('file'), async (req, res) => {
  try {
    console.log('Creating assignment with data:', req.body);
    console.log('File:', req.file);

    const { subject_name, subject_id, class_level, stream, title, description, due_date, total_marks } = req.body;
    const file_path = req.file ? req.file.filename : null;

    // Resolve the real teacher row for whoever is logged in, instead of
    // trusting a client-supplied teacher_id (which let anyone attribute
    // an assignment to any teacher).
    const teacherRow = await Teacher.findOne({ user_id: req.user.id });
    if (!teacherRow) {
      return res.status(403).json({ error: 'No teacher profile is linked to this account.' });
    }

    const assignment = await Assignment.create({
      teacher_id: teacherRow._id,
      teacher_name: `${teacherRow.first_name} ${teacherRow.last_name}`,
      subject_id, subject_name, class_level, stream,
      title, description, file_path, due_date, total_marks
    });

    console.log('Assignment created with ID:', assignment._id);

    // Notify students in the class
    const students = await Student.find({ class_level, $or: [{ stream }, { stream: 'both' }] }, '_id');
    if (students.length > 0) {
      await Notification.insertMany(students.map((student) => ({
        user_id: student.user_id,
        title: 'New Assignment',
        message: `${title} - Due: ${due_date}`,
        type: 'assignment'
      })));
    }

    res.status(201).json({ id: assignment._id });
  } catch (error) {
    console.error('Error creating assignment:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/submissions', authenticateToken, async (req, res) => {
  try {
    const submissions = await AssignmentSubmission.find({ assignment_id: req.params.id })
      .sort({ submitted_at: -1 })
      .populate('student_id', 'first_name last_name student_id');

    res.json(submissions.map((s) => {
      const json = s.toJSON();
      const student = json.student_id;
      return {
        ...json,
        student_id: student && student.id ? student.id : student,
        student_first_name: student && student.first_name,
        student_last_name: student && student.last_name,
        student_number: student && student.student_id
      };
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/submit', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { submission_text } = req.body;
    const file_path = req.file ? req.file.filename : null;

    const student = await Student.findOne({ user_id: req.user.id });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const existing = await AssignmentSubmission.findOne({ assignment_id: req.params.id, student_id: student._id });

    // If the teacher requested changes, let the student resubmit by
    // updating the existing row instead of blocking a second submission.
    if (existing) {
      if (existing.status !== 'rejected') {
        return res.status(400).json({ error: 'You have already submitted this assignment.' });
      }

      await AssignmentSubmission.findByIdAndUpdate(existing._id, {
        submission_text,
        file_path: file_path || existing.file_path,
        status: 'submitted',
        marks: null,
        grade: null,
        feedback: null,
        submitted_at: new Date()
      });

      const assignment = await Assignment.findById(req.params.id).populate('teacher_id', 'user_id');
      if (assignment && assignment.teacher_id) {
        await Notification.create({
          user_id: assignment.teacher_id.user_id,
          title: 'Assignment Resubmitted',
          message: 'A student resubmitted an assignment after requested changes',
          type: 'general'
        });
      }

      return res.json({ id: existing._id, message: 'Resubmitted successfully' });
    }

    const submission = await AssignmentSubmission.create({
      assignment_id: req.params.id, student_id: student._id, submission_text, file_path
    });

    // Notify teacher
    const assignment = await Assignment.findById(req.params.id).populate('teacher_id', 'user_id');
    if (assignment && assignment.teacher_id) {
      await Notification.create({
        user_id: assignment.teacher_id.user_id,
        title: 'Assignment Submitted',
        message: 'A student has submitted an assignment',
        type: 'general'
      });
    }

    res.status(201).json({ id: submission._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { teacher_name, subject_name, subject_id, class_level, stream, title, description, due_date, total_marks } = req.body;
    const file_path = req.file ? req.file.filename : null;

    // Only the teacher who created this assignment (or an admin) may edit it.
    const assignment = await Assignment.findById(req.params.id).populate('teacher_id');
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const isOwner = assignment.teacher_id && String(assignment.teacher_id.user_id) === String(req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit assignments you created.' });
    }

    const update = { teacher_name, subject_id, subject_name, class_level, stream, title, description, due_date, total_marks };
    if (file_path) update.file_path = file_path;

    await Assignment.findByIdAndUpdate(req.params.id, update);
    res.json({ message: 'Assignment updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Only the teacher who created this assignment (or an admin) may delete it.
    const assignment = await Assignment.findById(req.params.id).populate('teacher_id');
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const isOwner = assignment.teacher_id && String(assignment.teacher_id.user_id) === String(req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete assignments you created.' });
    }

    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/grade', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const { submission_id, marks, grade, feedback, status } = req.body;

    const finalStatus = status || 'graded';
    const notificationMessage = status === 'approved' ? 'Your assignment has been approved!' :
                              status === 'rejected' ? 'Your assignment needs changes. Please review feedback.' :
                              status === 'failed' ? 'Your assignment has been marked as failed.' :
                              `Your assignment has been graded. Grade: ${grade}`;

    await AssignmentSubmission.findByIdAndUpdate(submission_id, { marks, grade, feedback, status: finalStatus });

    // Notify student
    const submission = await AssignmentSubmission.findById(submission_id).populate('student_id', 'user_id');
    if (submission && submission.student_id) {
      await Notification.create({
        user_id: submission.student_id.user_id,
        title: 'Assignment Updated',
        message: notificationMessage,
        type: 'grade'
      });
    }

    res.json({ message: 'Submission updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/my-submission', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findOne({ user_id: req.user.id });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const submission = await AssignmentSubmission.findOne({ assignment_id: req.params.id, student_id: student._id });
    if (!submission) return res.status(404).json({ error: 'No submission found' });

    res.json(submission);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
