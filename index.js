const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');
const { AccessToken, RoomServiceClient, WebhookReceiver } = require('livekit-server-sdk');

// Import models
const User = require('./models/User');
const Student = require('./models/Student');
const Teacher = require('./models/Teacher');
const Subject = require('./models/Subject');
const Mark = require('./models/Mark');
const Message = require('./models/Message');
const ClassMessage = require('./models/ClassMessage');
const Notification = require('./models/Notification');
const Announcement = require('./models/Announcement');
const Event = require('./models/Event');
const VideoSession = require('./models/VideoSession');
const Attendance = require('./models/Attendance');
const Application = require('./models/Application');
const Gallery = require('./models/Gallery');
const Fee = require('./models/Fee');
const Assignment = require('./models/Assignment');
const AssignmentSubmission = require('./models/AssignmentSubmission');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || process.env.CLIENTURL || process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ============================================================
// LiveKit (real WebRTC video) setup
// ============================================================
// LiveKit is a self-hosted, open-source SFU (Selective Forwarding Unit) —
// this is what actually carries audio/video between participants. This
// backend never touches the media itself; it only issues signed tokens
// that say who a user is and what they're allowed to do in a room
// (publish camera/mic, or view only), and receives webhooks to log
// attendance. See SETUP.md for how to run the LiveKit server itself
// (docker-compose.yml / livekit.yaml).
//
// Required .env vars:
//   LIVEKIT_WS_URL=ws://localhost:7880        (wss://your-domain in production)
//   LIVEKIT_HTTP_URL=http://localhost:7880    (https://your-domain in production)
//   LIVEKIT_API_KEY=...
//   LIVEKIT_API_SECRET=...
// ============================================================

const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || 'ws://localhost:7880';
const LIVEKIT_HTTP_URL = process.env.LIVEKIT_HTTP_URL || 'http://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.warn('LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not set — /api/livekit routes will fail.');
}

const livekitRoomService = new RoomServiceClient(LIVEKIT_HTTP_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const livekitWebhookReceiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// The existing video_sessions.meeting_id doubles as the LiveKit room name.
function livekitRoomNameFor(meetingId) {
  return `class_${meetingId}`;
}

async function buildLivekitToken({ identity, name, roomName, canPublish }) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name, ttl: '10h' });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: true
  });
  return at.toJwt();
}

// ---- LiveKit webhook: real join/leave events -> attendance table ----
// IMPORTANT: this route needs the RAW request body to verify LiveKit's
// signature, so it's registered here with express.raw(), BEFORE
// app.use(express.json()) runs below. If you ever move this route after
// the json() middleware, the signature check will start failing because
// the body will already have been parsed into an object.
app.post('/api/livekit/webhook', express.raw({ type: 'application/webhook+json' }), async (req, res) => {
  try {
    const event = await livekitWebhookReceiver.receive(req.body, req.get('Authorization'));
    const userId = Number(String(event.participant?.identity || '').replace('user-', ''));
    const meetingId = String(event.room?.name || '').replace('class_', '');
    if (!userId || !meetingId) return res.status(200).send('ignored');

    if (event.event === 'participant_joined') {
      Student.findOne({ user_id: userId }).then(student => {
        if (!student) return;
        VideoSession.findOne({ meeting_id: meetingId }).then(session => {
          if (!session) return;
          Attendance.create({
            student_id: student._id,
            session_id: session._id,
            join_time: new Date(),
            status: 'present'
          });
        });
      });
    }

    if (event.event === 'participant_left') {
      Student.findOne({ user_id: userId }).then(student => {
        if (!student) return;
        Attendance.findOneAndUpdate(
          { student_id: student._id, leave_time: null },
          { leave_time: new Date() }
        );
      });
    }

    res.status(200).send('ok');
  } catch (e) {
    console.error('LiveKit webhook error:', e);
    res.status(400).send('invalid webhook');
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || process.env.CLIENTURL || process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB database');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err.message);
  });

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`User joined session: ${sessionId}`);
  });

  socket.on('leave-session', (sessionId) => {
    socket.leave(sessionId);
    console.log(`User left session: ${sessionId}`);
  });

  socket.on('session-message', (data) => {
    io.to(data.sessionId).emit('session-message', data);
  });

  socket.on('raise-hand', (data) => {
    io.to(data.sessionId).emit('raise-hand', data);
  });

  socket.on('screen-share', (data) => {
    socket.to(data.sessionId).emit('screen-share', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, role, first_name, last_name } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      role,
      first_name,
      last_name
    });

    const token = jwt.sign(
      { id: user._id, email, role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(201).json({ token, user: { id: user._id, email, role, first_name, last_name } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// ============================================================
// LiveKit routes — real video join / promote / demote / end
// (defined here, right after authenticateToken, since they need it)
// ============================================================

// ---- Join a class session: issue a role-scoped LiveKit token ----
app.post('/api/livekit/join', authenticateToken, async (req, res) => {
  const { meetingId } = req.body;
  if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });

  try {
    const session = await VideoSession.findOne({ meeting_id: meetingId })
      .populate('teacher_id');

    if (!session) return res.status(404).json({ error: 'Session not found' });

    const roomName = livekitRoomNameFor(meetingId);
    const isTeacher = session.teacher_id.user_id === req.user.id;

    // Auto-create the room on first join. No-op (safely ignored) if it
    // already exists — that's normal once students start arriving.
    await livekitRoomService
      .createRoom({
        name: roomName,
        emptyTimeout: 600,
        maxParticipants: 3000, // raise further with a multi-node LiveKit deployment, see SETUP.md
        metadata: JSON.stringify({ videoSessionId: session._id })
      })
      .catch(() => {});

    const identity = `user-${req.user.id}`;

    const token = await buildLivekitToken({
      identity,
      name: req.user.email,
      roomName,
      canPublish: isTeacher // students join as viewers; promoted via /promote below
    });

    if (isTeacher) {
      await VideoSession.findByIdAndUpdate(session._id, { status: 'live' });
    }

    res.json({ token, wsUrl: LIVEKIT_WS_URL, roomName, identity, isTeacher });
  } catch (e) {
    console.error('LiveKit join error:', e);
    res.status(500).json({ error: 'Could not create a video session token' });
  }
});

// ---- Teacher promotes a raised hand to on-camera ----
app.post('/api/livekit/promote', authenticateToken, async (req, res) => {
  const { meetingId, studentUserId } = req.body;
  if (!meetingId || !studentUserId) {
    return res.status(400).json({ error: 'meetingId and studentUserId are required' });
  }

  try {
    const session = await VideoSession.findOne({ meeting_id: meetingId })
      .populate('teacher_id');

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacher_id.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the session teacher can promote participants' });
    }

    const roomName = livekitRoomNameFor(meetingId);
    const identity = `user-${studentUserId}`;

    // Live permission upgrade — LiveKit pushes this to the student's
    // existing connection. No reconnect / new token needed on their end.
    await livekitRoomService.updateParticipant(roomName, identity, {
      permission: { canPublish: true, canSubscribe: true, canPublishData: true }
    });

    io.to(roomName).emit('livekit-promoted', { identity, userId: studentUserId });
    res.json({ message: 'Promoted to on-camera' });
  } catch (e) {
    console.error('Promote error:', e);
    res.status(500).json({ error: 'Could not promote participant' });
  }
});

// ---- Teacher revokes on-camera access ----
app.post('/api/livekit/demote', authenticateToken, async (req, res) => {
  const { meetingId, studentUserId } = req.body;
  if (!meetingId || !studentUserId) {
    return res.status(400).json({ error: 'meetingId and studentUserId are required' });
  }

  const roomName = livekitRoomNameFor(meetingId);
  const identity = `user-${studentUserId}`;

  try {
    await livekitRoomService.updateParticipant(roomName, identity, {
      permission: { canPublish: false, canSubscribe: true, canPublishData: true }
    });
    io.to(roomName).emit('livekit-demoted', { identity, userId: studentUserId });
    res.json({ message: 'Removed from camera' });
  } catch (e) {
    console.error('Demote error:', e);
    res.status(500).json({ error: 'Could not demote participant' });
  }
});

// ---- Teacher ends the session for everyone ----
app.post('/api/livekit/end', authenticateToken, async (req, res) => {
  const { meetingId } = req.body;
  if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });

  const roomName = livekitRoomNameFor(meetingId);
  try {
    await livekitRoomService.deleteRoom(roomName); // disconnects every participant immediately
    await VideoSession.findOneAndUpdate({ meeting_id: meetingId }, { status: 'completed' });
    res.json({ message: 'Session ended' });
  } catch (e) {
    console.error('End session error:', e);
    res.status(500).json({ error: 'Could not end session' });
  }
});

// Student routes
app.get('/api/students/me', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findOne({ user_id: req.user.id });
    if (!student) return res.status(404).json({ error: 'Student profile not found' });
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/students', authenticateToken, async (req, res) => {
  try {
    const { search, stream, class_level } = req.query;
    let query = { status: 'active' };

    if (search) {
      query.$or = [
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { student_id: { $regex: search, $options: 'i' } }
      ];
    }

    if (stream) {
      query.stream = stream;
    }

    if (class_level) {
      query.class_level = class_level;
    }

    const students = await Student.find(query);
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/students', authenticateToken, async (req, res) => {
  try {
    const { student_id, first_name, last_name, date_of_birth, gender, address, parent_phone, parent_email, class_level, stream, admission_date } = req.body;

    console.log('Creating student profile with data:', {
      user_id: req.user.id,
      student_id,
      first_name,
      last_name,
      date_of_birth,
      gender,
      address,
      parent_phone,
      parent_email,
      class_level,
      stream,
      admission_date
    });

    const student = await Student.create({
      user_id: req.user.id,
      student_id,
      first_name,
      last_name,
      date_of_birth,
      gender,
      address,
      parent_phone,
      parent_email,
      class_level,
      stream,
      admission_date
    });

    console.log('Student profile created with ID:', student._id);
    res.status(201).json({ id: student._id, ...req.body });
  } catch (error) {
    console.error('Error creating student profile:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/students/:id', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, date_of_birth, gender, address, parent_phone, parent_email, class_level, stream, status } = req.body;

    await Student.findByIdAndUpdate(req.params.id, {
      first_name,
      last_name,
      date_of_birth,
      gender,
      address,
      parent_phone,
      parent_email,
      class_level,
      stream,
      status
    });

    res.json({ message: 'Student updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Teacher routes
app.get('/api/teachers', async (req, res) => {
  try {
    const teachers = await Teacher.find({ status: 'active' });
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/teachers/me', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ user_id: req.user.id });
    if (!teacher) return res.status(404).json({ error: 'Teacher profile not found' });
    res.json(teacher);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/teachers', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const { teacher_id, first_name, last_name, subject, department, phone, email, qualification, hire_date } = req.body;
    const photo = req.file ? req.file.filename : null;

    const teacher = await Teacher.create({
      user_id: req.user.id,
      teacher_id,
      first_name,
      last_name,
      subject,
      department,
      phone,
      email,
      qualification,
      photo,
      hire_date
    });

    res.status(201).json({ id: teacher._id, ...req.body, photo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Subject routes
app.get('/api/subjects', async (req, res) => {
  try {
    const subjects = await Subject.find();
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subjects', authenticateToken, async (req, res) => {
  try {
    const { name, code, stream, class_level, description } = req.body;

    const subject = await Subject.create({
      name,
      code,
      stream,
      class_level,
      description
    });

    res.status(201).json({ id: subject._id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marks routes
app.get('/api/marks', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ user_id: req.user.id });
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    const { term, year } = req.query;
    let query = { teacher_id: teacher._id };

    if (term) {
      query.term = term;
    }

    if (year) {
      query.year = parseInt(year);
    }

    const marks = await Mark.find(query)
      .populate('subject_id', 'name code')
      .populate('student_id', 'first_name last_name student_id');

    res.json(marks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/marks/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { term, year } = req.query;
    let query = { student_id: req.params.studentId };

    if (term) {
      query.term = term;
    }

    if (year) {
      query.year = parseInt(year);
    }

    const marks = await Mark.find(query)
      .populate('subject_id', 'name code')
      .populate('teacher_id', 'first_name last_name');

    res.json(marks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/marks', authenticateToken, async (req, res) => {
  try {
    const { student_id, subject_id, teacher_id, term, year, assignment_marks, mid_term_marks, final_marks, comments } = req.body;

    const total_marks = (assignment_marks || 0) + (mid_term_marks || 0) + (final_marks || 0);
    let grade = 'F';

    if (total_marks >= 80) grade = 'A';
    else if (total_marks >= 70) grade = 'B';
    else if (total_marks >= 60) grade = 'C';
    else if (total_marks >= 50) grade = 'D';
    else if (total_marks >= 40) grade = 'E';

    const mark = await Mark.create({
      student_id,
      subject_id,
      teacher_id,
      term,
      year,
      assignment_marks,
      mid_term_marks,
      final_marks,
      total_marks,
      grade,
      comments
    });

    res.status(201).json({ id: mark._id, total_marks, grade });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Messages routes
app.get('/api/messages', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const messages = await Message.find({
      $or: [{ sender_id: userId }, { receiver_id: userId }]
    })
      .populate('sender_id', 'first_name last_name')
      .populate('receiver_id', 'first_name last_name')
      .sort({ created_at: -1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages', authenticateToken, async (req, res) => {
  try {
    const { receiver_id, subject, message } = req.body;

    const msg = await Message.create({
      sender_id: req.user.id,
      receiver_id,
      message,
      sender_name: subject || 'Message'
    });

    // Create notification for receiver
    await Notification.create({
      user_id: receiver_id,
      title: 'New Message',
      message: subject || 'You have a new message',
      type: 'general'
    });

    res.status(201).json({ id: msg._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Notifications routes
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ user_id: req.user.id })
      .sort({ created_at: -1 });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { is_read: true });
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Announcements routes
app.get('/api/announcements', async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate('author_id', 'first_name last_name')
      .sort({ created_at: -1 })
      .limit(10);
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/announcements', authenticateToken, async (req, res) => {
  try {
    const { title, content, priority } = req.body;

    const announcement = await Announcement.create({
      title,
      content,
      author_id: req.user.id,
      priority
    });

    // Notify all users
    const users = await User.find();
    const notifications = users.map(user => ({
      user_id: user._id,
      title,
      message: content.substring(0, 100),
      type: 'announcement'
    }));

    await Notification.insertMany(notifications);

    res.status(201).json({ id: announcement._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Events routes
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find({
      event_date: { $gte: new Date() }
    })
      .sort({ event_date: 1 })
      .limit(10);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', authenticateToken, async (req, res) => {
  try {
    const { title, description, event_date, event_time, location, type } = req.body;

    const event = await Event.create({
      title,
      description,
      event_date,
      event_time,
      location,
      type
    });

    res.status(201).json({ id: event._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Video sessions routes
app.get('/api/video-sessions', authenticateToken, async (req, res) => {
  try {
    const { class_level, subject_id } = req.query;
    let query = { status: { $ne: 'cancelled' } };

    if (class_level) {
      query.class_level = class_level;
    }

    if (subject_id) {
      query.subject_id = subject_id;
    }

    const sessions = await VideoSession.find(query)
      .populate('subject_id', 'name')
      .populate('teacher_id', 'first_name last_name')
      .sort({ scheduled_date: 1 });

    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/video-sessions', authenticateToken, async (req, res) => {
  try {
    const { title, description, subject_id, class_level, scheduled_date, duration } = req.body;

    // Get teacher_id from authenticated user
    const teacher = await Teacher.findOne({ user_id: req.user.id });
    if (!teacher) {
      console.log('User', req.user.id, 'does not have a teacher profile');
      return res.status(403).json({ error: 'Only teachers can create sessions. Please complete your teacher profile first.' });
    }

    const meeting_id = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const session = await VideoSession.create({
      title,
      description,
      teacher_id: teacher._id,
      subject_id: subject_id || null,
      class_level,
      scheduled_date,
      duration,
      meeting_id
    });

    res.status(201).json({ id: session._id, meeting_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/video-sessions/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, recording_url } = req.body;

    await VideoSession.findByIdAndUpdate(req.params.id, {
      status,
      recording_url
    });

    res.json({ message: 'Session status updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Attendance routes
app.post('/api/attendance', authenticateToken, async (req, res) => {
  try {
    const { student_id, session_id, status } = req.body;

    const attendance = await Attendance.create({
      student_id,
      session_id,
      join_time: new Date(),
      status
    });

    res.status(201).json({ id: attendance._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/attendance/:id', authenticateToken, async (req, res) => {
  try {
    const { leave_time, duration } = req.body;

    await Attendance.findByIdAndUpdate(req.params.id, {
      leave_time,
      duration
    });

    res.json({ message: 'Attendance updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Application routes
app.post('/api/applications', upload.single('photo'), async (req, res) => {
  try {
    const { first_name, last_name, date_of_birth, gender, previous_school, parent_name, parent_phone, parent_email, address, stream_preference, class_level, amount_paid } = req.body;
    const application_number = 'APP' + Date.now();
    const photo = req.file ? req.file.filename : null;
    const amountPaidValue = amount_paid ? parseFloat(amount_paid) : null;

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
      photo,
      amount_paid: amountPaidValue
    });

    res.status(201).json({
      id: application._id,
      application_number,
      photo_url: photo ? `/uploads/${photo}` : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an application (self-service "undo" for a mistaken submission).
// Matches the same trust model as the status-check endpoint: knowing the
// application number is enough, since applicants get that number right
// after submitting and it isn't otherwise guessable/enumerable in the UI.
app.delete('/api/applications/:number', async (req, res) => {
  try {
    const application = await Application.findOne({ application_number: req.params.number });
    if (!application) return res.status(404).json({ error: 'Application not found' });

    await Application.deleteOne({ application_number: req.params.number });

    // Clean up the uploaded photo file, if any, since it's now orphaned.
    if (application.photo) {
      const photoPath = path.join(__dirname, 'uploads', application.photo);
      fs.unlink(photoPath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          console.error('Could not delete application photo file:', unlinkErr.message);
        }
      });
    }

    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/applications/:number', async (req, res) => {
  try {
    const application = await Application.findOne({ application_number: req.params.number });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Gallery routes
app.get('/api/gallery', async (req, res) => {
  try {
    const { category } = req.query;
    let query = {};

    if (category) {
      query.category = category;
    }

    const items = await Gallery.find(query).sort({ created_at: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gallery', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { title, description, category } = req.body;
    const file_type = req.file.mimetype.startsWith('video') ? 'video' : 'image';

    const galleryItem = await Gallery.create({
      title,
      description,
      file_path: req.file.filename,
      file_type,
      category,
      uploaded_by: req.user.id
    });

    res.status(201).json({ id: galleryItem._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fees routes
app.get('/api/fees/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const fees = await Fee.find({ student_id: req.params.studentId })
      .sort({ year: -1, term: -1 });
    res.json(fees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fees', authenticateToken, async (req, res) => {
  try {
    const { student_id, term, year, amount, due_date } = req.body;

    const fee = await Fee.create({
      student_id,
      term,
      year,
      amount,
      balance: amount,
      due_date
    });

    res.status(201).json({ id: fee._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Contact form route
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  try {
    // Store in database (optional)
    // Send email notification
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: email,
      to: process.env.SCHOOL_EMAIL || 'school@lycee-obessa.com',
      subject: `Contact Form: ${subject}`,
      text: `From: ${name} (${email})\n\n${message}`
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Message sent successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assignment routes
app.get('/api/assignments', async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate('subject_id', 'name')
      .populate('teacher_id', 'first_name last_name')
      .sort({ created_at: -1 });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/assignments/teacher', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ user_id: req.user.id });
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    const assignments = await Assignment.find({ teacher_id: teacher._id })
      .populate('subject_id', 'name')
      .sort({ created_at: -1 });

    // Get submission counts for each assignment
    const assignmentsWithCounts = await Promise.all(
      assignments.map(async (assignment) => {
        const submissionCount = await AssignmentSubmission.countDocuments({ assignment_id: assignment._id });
        return {
          ...assignment.toObject(),
          submission_count: submissionCount
        };
      })
    );

    res.json(assignmentsWithCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/assignments/:id', authenticateToken, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('subject_id', 'name')
      .populate('teacher_id', 'first_name last_name');
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/assignments', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    console.log('Creating assignment with data:', req.body);
    console.log('File:', req.file);

    const { teacher_name, subject_name, subject_id, class_level, stream, title, description, due_date, total_marks } = req.body;
    const file_path = req.file ? req.file.filename : null;

    // Resolve the real teacher row for whoever is logged in, instead of
    // hardcoding teacher_id = 1 (which silently attributed every
    // assignment to the same teacher regardless of who created it).
    const teacherRow = await Teacher.findOne({ user_id: req.user.id });
    if (!teacherRow) {
      return res.status(403).json({ error: 'No teacher profile is linked to this account.' });
    }

    const teacherId = teacherRow._id;

    const assignment = await Assignment.create({
      teacher_id: teacherId,
      teacher_name,
      subject_id,
      subject_name,
      class_level,
      stream,
      title,
      description,
      file_path,
      due_date,
      total_marks
    });

    console.log('Assignment created with ID:', assignment._id);

    // Notify students in the class
    const students = await Student.find({
      class_level,
      $or: [{ stream }, { stream: 'both' }]
    });

    if (students && students.length > 0) {
      const notifications = students.map(student => ({
        user_id: student.user_id,
        title: 'New Assignment',
        message: `${title} - Due: ${due_date}`,
        type: 'assignment'
      }));
      await Notification.insertMany(notifications);
    }

    res.status(201).json({ id: assignment._id });
  } catch (error) {
    console.error('Error creating assignment:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/assignments/:id/submissions', authenticateToken, async (req, res) => {
  try {
    const submissions = await AssignmentSubmission.find({ assignment_id: req.params.id })
      .populate('student_id', 'first_name last_name student_id')
      .sort({ submitted_at: -1 });
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/assignments/:id/submit', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { submission_text } = req.body;
    const file_path = req.file ? req.file.filename : null;

    // Get student_id from user_id
    const student = await Student.findOne({ user_id: req.user.id });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Check for an existing submission
    const existing = await AssignmentSubmission.findOne({
      assignment_id: req.params.id,
      student_id: student._id
    });

    // If the teacher requested changes, allow the student to resubmit
    // by updating the existing row instead of blocking a second submission.
    if (existing) {
      if (existing.status !== 'rejected') {
        return res.status(400).json({ error: 'You have already submitted this assignment.' });
      }

      const updatedFilePath = file_path || existing.file_path;

      await AssignmentSubmission.findByIdAndUpdate(existing.id, {
        submission_text,
        file_path: updatedFilePath,
        status: 'submitted',
        marks: null,
        grade: null,
        feedback: null,
        submitted_at: new Date()
      });

      const assignment = await Assignment.findById(req.params.id).populate('teacher_id');
      if (assignment) {
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
      assignment_id: req.params.id,
      student_id: student._id,
      submission_text,
      file_path
    });

    // Notify teacher
    const assignment = await Assignment.findById(req.params.id).populate('teacher_id');
    if (assignment) {
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

app.put('/api/assignments/:id', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { teacher_name, subject_name, subject_id, class_level, stream, title, description, due_date, total_marks } = req.body;
    const file_path = req.file ? req.file.filename : null;

    // Only the teacher who created this assignment (or an admin) may edit it.
    const assignment = await Assignment.findById(req.params.id).populate('teacher_id');
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const isOwner = assignment.teacher_id.user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only edit assignments you created.' });
    }

    const updateData = {
      teacher_name,
      subject_id,
      subject_name,
      class_level,
      stream,
      title,
      description,
      due_date,
      total_marks
    };

    if (file_path) {
      updateData.file_path = file_path;
    }

    await Assignment.findByIdAndUpdate(req.params.id, updateData);
    res.json({ message: 'Assignment updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/assignments/:id', authenticateToken, async (req, res) => {
  try {
    // Only the teacher who created this assignment (or an admin) may delete it.
    const assignment = await Assignment.findById(req.params.id).populate('teacher_id');
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const isOwner = assignment.teacher_id.user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete assignments you created.' });
    }

    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/assignments/:id/grade', authenticateToken, async (req, res) => {
  try {
    const { submission_id, marks, grade, feedback, status } = req.body;

    const finalStatus = status || 'graded';
    const notificationMessage = status === 'approved' ? 'Your assignment has been approved!' :
                              status === 'rejected' ? 'Your assignment needs changes. Please review feedback.' :
                              status === 'failed' ? 'Your assignment has been marked as failed.' :
                              `Your assignment has been graded. Grade: ${grade}`;

    await AssignmentSubmission.findByIdAndUpdate(submission_id, {
      marks,
      grade,
      feedback,
      status: finalStatus
    });

    // Notify student
    const submission = await AssignmentSubmission.findById(submission_id).populate('student_id');
    if (submission) {
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

app.get('/api/assignments/:id/my-submission', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findOne({ user_id: req.user.id });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const submission = await AssignmentSubmission.findOne({
      assignment_id: req.params.id,
      student_id: student._id
    });

    if (!submission) return res.status(404).json({ error: 'No submission found' });
    res.json(submission);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics for dashboard
app.get('/api/statistics', authenticateToken, async (req, res) => {
  try {
    const [
      studentsCount,
      teachersCount,
      subjectsCount,
      sessionsCount
    ] = await Promise.all([
      Student.countDocuments({ status: 'active' }),
      Teacher.countDocuments({ status: 'active' }),
      Subject.countDocuments(),
      VideoSession.countDocuments({ status: 'scheduled' })
    ]);

    res.json({
      students: studentsCount,
      teachers: teachersCount,
      subjects: subjectsCount,
      sessions: sessionsCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// AI Chat endpoint - Using Groq API with OpenAI SDK
// ============================================================
//
// IMPORTANT: If this endpoint returns 500 errors, check your
// terminal output. The error handling below prints a specific,
// human-readable diagnosis for the most common failure modes:
//   - Missing GROQ_API_KEY in .env
//   - Invalid / revoked API key
//   - Wrong or decommissioned model name
//   - Rate limiting
//
// To get a fresh key: https://console.groq.com/keys
// To see current supported models: https://console.groq.com/docs/models
// ============================================================

const GROQ_MODEL = 'openai/gpt-oss-20b'; // confirmed available via /v1/models for this account

app.post('/api/ai/chat', async (req, res) => {
  const { message, conversationHistory } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A non-empty "message" field is required.' });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    console.error('GROQ_API_KEY is missing from environment variables.');
    return res.status(500).json({ error: 'Groq API key not configured on the server.' });
  }

  const openai = new OpenAI({
    apiKey: groqApiKey,
    baseURL: 'https://api.groq.com/openai/v1'
  });

  const systemPrompt = 'You are John Enow AI, a helpful educational assistant for students. Answer questions directly, clearly, and accurately. Provide explanations, formulas, definitions, and examples when helpful. Be concise but thorough. If asked for a formula, provide it clearly. If asked for a definition, give a clear, accurate definition. Help students understand concepts across all subjects.';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(conversationHistory) ? conversationHistory : []).map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    })),
    { role: 'user', content: message }
  ];

  try {
    console.log(`Attempting Groq API call (model: ${GROQ_MODEL})...`);

    const completion = await openai.chat.completions.create({
      model: GROQ_MODEL,
      messages: messages,
      max_tokens: 8000,
      temperature: 0.7
    });

    const reply = completion?.choices?.[0]?.message?.content;
    if (!reply) {
      console.error('Groq API returned an unexpected response shape:', JSON.stringify(completion));
      return res.status(500).json({ error: 'Invalid response from Groq API' });
    }

    return res.json({ response: reply });

  } catch (error) {
    // error.code comes from Groq's OpenAI-compatible error payload
    const code = error?.code || error?.error?.code;
    const status = error?.status;

    console.error('--- Groq API error ---');
    console.error('status:', status, '| code:', code);
    console.error('message:', error.message);

    if (code === 'invalid_api_key' || status === 401) {
      console.error(
        'DIAGNOSIS: Your GROQ_API_KEY is invalid or has been revoked.\n' +
        'Fix: generate a new key at https://console.groq.com/keys and update your .env file, then restart the server.'
      );
      return res.status(500).json({
        error: 'The AI service is not configured correctly (invalid API key). Please contact the site administrator.'
      });
    }

    if (code === 'model_not_found' || code === 'model_decommissioned' || status === 404) {
      console.error(
        `DIAGNOSIS: The model "${GROQ_MODEL}" is not available on this account.\n` +
        'Fix: open https://console.groq.com/docs/models to see currently supported models, ' +
        'update the GROQ_MODEL constant near the top of the /api/ai/chat route, and restart the server.'
      );
      return res.status(500).json({
        error: 'The AI service is temporarily using an unsupported model. Please contact the site administrator.'
      });
    }

    if (status === 429) {
      console.error('DIAGNOSIS: Rate limit hit on the Groq account. Wait and retry, or upgrade your Groq plan.');
      return res.status(429).json({ error: 'The AI service is busy right now. Please try again in a moment.' });
    }

    // Fallback: unknown error, still log full details for debugging
    console.error('Full error object:', error);
    return res.status(500).json({ error: 'Failed to get a response from the AI service. Please try again.' });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Socket.io for real-time messaging
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room for private messaging
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });

  // Send private message
  socket.on('private_message', async (data) => {
    const { senderId, receiverId, message, senderName } = data;

    try {
      // Store message in database
      const msg = await Message.create({
        sender_id: senderId,
        receiver_id: receiverId,
        message,
        sender_name: senderName,
        created_at: new Date()
      });

      // Send to receiver if online
      io.to(receiverId).emit('receive_message', {
        id: msg._id,
        sender_id: senderId,
        receiver_id: receiverId,
        message: message,
        sender_name: senderName,
        created_at: msg.created_at
      });

      // Send confirmation to sender
      socket.emit('message_sent', {
        id: msg._id,
        sender_id: senderId,
        receiver_id: receiverId,
        message: message,
        sender_name: senderName,
        created_at: msg.created_at
      });
    } catch (err) {
      console.error('Error storing message:', err);
    }
  });

  // Join a room for group/class messaging
  socket.on('join_class', (classLevel) => {
    socket.join(`class_${classLevel}`);
    console.log(`User joined class room: class_${classLevel}`);
  });

  // Send class-wide message
  socket.on('class_message', async (data) => {
    const { senderId, classLevel, message, senderName } = data;

    try {
      const classMsg = await ClassMessage.create({
        sender_id: senderId,
        class_level: classLevel,
        message,
        sender_name: senderName,
        created_at: new Date()
      });

      // Broadcast to class room
      io.to(`class_${classLevel}`).emit('receive_class_message', {
        id: classMsg._id,
        sender_id: senderId,
        class_level: classLevel,
        message: message,
        sender_name: senderName,
        created_at: classMsg.created_at
      });
    } catch (err) {
      console.error('Error storing class message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Messages API endpoints
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const messages = await Message.find({
      $or: [
        { sender_id: currentUserId, receiver_id: userId },
        { sender_id: userId, receiver_id: currentUserId }
      ]
    }).sort({ created_at: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/conversations', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender_id: currentUserId }, { receiver_id: currentUserId }]
        }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender_id', currentUserId] },
              '$receiver_id',
              '$sender_id'
            ]
          },
          last_message_time: { $max: '$created_at' }
        }
      },
      {
        $sort: { last_message_time: -1 }
      },
      {
        $project: {
          other_user_id: '$_id',
          last_message_time: 1,
          _id: 0
        }
      }
    ]);

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/class-messages/:classLevel', authenticateToken, async (req, res) => {
  try {
    const { classLevel } = req.params;

    const messages = await ClassMessage.find({ class_level: classLevel })
      .sort({ created_at: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});