const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
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

// Database initialization
const db = new sqlite3.Database('./school.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student', 'parent')),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Students table
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    student_id TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE,
    gender TEXT,
    address TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    class_level TEXT,
    stream TEXT CHECK(stream IN ('english', 'french')),
    admission_date DATE,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Teachers table
  db.run(`CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    teacher_id TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    department TEXT,
    phone TEXT,
    email TEXT,
    qualification TEXT,
    photo TEXT,
    hire_date DATE,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Subjects table
  db.run(`CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    stream TEXT CHECK(stream IN ('english', 'french', 'both')),
    class_level TEXT,
    description TEXT
  )`);

  // Marks table
  db.run(`CREATE TABLE IF NOT EXISTS marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    subject_id INTEGER,
    teacher_id INTEGER,
    term TEXT NOT NULL,
    year INTEGER NOT NULL,
    assignment_marks REAL,
    mid_term_marks REAL,
    final_marks REAL,
    total_marks REAL,
    grade TEXT,
    comments TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
  )`);

  // Messages table
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    sender_name TEXT,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  )`);

  // Class messages table
  db.run(`CREATE TABLE IF NOT EXISTS class_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    class_level TEXT NOT NULL,
    message TEXT NOT NULL,
    sender_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id)
  )`);

  // Notifications table
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK(type IN ('announcement', 'exam', 'event', 'grade', 'general')),
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Announcements table
  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER,
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id)
  )`);

  // Events table
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    event_time TIME,
    location TEXT,
    type TEXT CHECK(type IN ('academic', 'sports', 'cultural', 'meeting', 'exam')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Video sessions table
  db.run(`CREATE TABLE IF NOT EXISTS video_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    teacher_id INTEGER NOT NULL,
    subject_id INTEGER,
    class_level TEXT,
    scheduled_date DATETIME NOT NULL,
    duration INTEGER,
    meeting_id TEXT UNIQUE NOT NULL,
    recording_url TEXT,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'live', 'completed', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  )`);

  // Attendance table
  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    join_time DATETIME,
    leave_time DATETIME,
    duration INTEGER,
    status TEXT DEFAULT 'present' CHECK(status IN ('present', 'absent', 'late')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (session_id) REFERENCES video_sessions(id)
  )`);

  // Applications table
  db.run(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_number TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE,
    gender TEXT,
    previous_school TEXT,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    address TEXT,
    stream_preference TEXT CHECK(stream_preference IN ('english', 'french')),
    class_level TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'under_review', 'accepted', 'rejected')),
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Gallery table
  db.run(`CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    file_type TEXT CHECK(file_type IN ('image', 'video')),
    category TEXT,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  )`);

  // Fees table
  db.run(`CREATE TABLE IF NOT EXISTS fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    term TEXT NOT NULL,
    year INTEGER NOT NULL,
    amount REAL NOT NULL,
    paid_amount REAL DEFAULT 0,
    balance REAL,
    due_date DATE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'partial', 'paid', 'overdue')),
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  // Assignments table
  db.run(`CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    teacher_name TEXT,
    subject_id INTEGER,
    subject_name TEXT,
    class_level TEXT,
    stream TEXT CHECK(stream IN ('science', 'art', 'both')),
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    due_date DATETIME,
    total_marks INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  )`);

  // Add new columns if they don't exist (for existing databases)
  db.run(`ALTER TABLE assignments ADD COLUMN teacher_name TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('Error adding teacher_name column:', err.message);
    }
  });
  
  db.run(`ALTER TABLE assignments ADD COLUMN subject_name TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('Error adding subject_name column:', err.message);
    }
  });

  // Assignment submissions table
  db.run(`CREATE TABLE IF NOT EXISTS assignment_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    submission_text TEXT,
    file_path TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    marks REAL,
    grade TEXT,
    feedback TEXT,
    status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'graded', 'late')),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  console.log('Database tables initialized');
}

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
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (user) return res.status(400).json({ error: 'User already exists' });

      const hashedPassword = await bcrypt.hash(password, 10);
      
      db.run('INSERT INTO users (email, password, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
        [email, hashedPassword, role, first_name, last_name],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          
          const token = jwt.sign(
            { id: this.lastID, email, role },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
          );
          
          res.status(201).json({ token, user: { id: this.lastID, email, role, first_name, last_name } });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) return res.status(400).json({ error: 'Invalid credentials' });

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );
      
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          email: user.email, 
          role: user.role, 
          first_name: user.first_name, 
          last_name: user.last_name 
        } 
      });
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

// Student routes
app.get('/api/students', authenticateToken, (req, res) => {
  const { search, stream, class_level } = req.query;
  let query = 'SELECT * FROM students WHERE status = "active"';
  const params = [];

  if (search) {
    query += ' AND (first_name LIKE ? OR last_name LIKE ? OR student_id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (stream) {
    query += ' AND stream = ?';
    params.push(stream);
  }

  if (class_level) {
    query += ' AND class_level = ?';
    params.push(class_level);
  }

  db.all(query, params, (err, students) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(students);
  });
});

app.post('/api/students', authenticateToken, (req, res) => {
  const { student_id, first_name, last_name, date_of_birth, gender, address, parent_phone, parent_email, class_level, stream, admission_date } = req.body;
  
  db.run(`INSERT INTO students (student_id, first_name, last_name, date_of_birth, gender, address, parent_phone, parent_email, class_level, stream, admission_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [student_id, first_name, last_name, date_of_birth, gender, address, parent_phone, parent_email, class_level, stream, admission_date],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, ...req.body });
    }
  );
});

app.put('/api/students/:id', authenticateToken, (req, res) => {
  const { first_name, last_name, date_of_birth, gender, address, parent_phone, parent_email, class_level, stream, status } = req.body;
  
  db.run(`UPDATE students SET first_name = ?, last_name = ?, date_of_birth = ?, gender = ?, address = ?, 
          parent_phone = ?, parent_email = ?, class_level = ?, stream = ?, status = ? WHERE id = ?`,
    [first_name, last_name, date_of_birth, gender, address, parent_phone, parent_email, class_level, stream, status, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Student updated successfully' });
    }
  );
});

// Teacher routes
app.get('/api/teachers', (req, res) => {
  db.all('SELECT * FROM teachers WHERE status = "active"', (err, teachers) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(teachers);
  });
});

app.post('/api/teachers', authenticateToken, upload.single('photo'), (req, res) => {
  const { teacher_id, first_name, last_name, subject, department, phone, email, qualification, hire_date } = req.body;
  const photo = req.file ? req.file.filename : null;
  
  db.run(`INSERT INTO teachers (teacher_id, first_name, last_name, subject, department, phone, email, qualification, photo, hire_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [teacher_id, first_name, last_name, subject, department, phone, email, qualification, photo, hire_date],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, ...req.body, photo });
    }
  );
});

// Subject routes
app.get('/api/subjects', (req, res) => {
  db.all('SELECT * FROM subjects', (err, subjects) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(subjects);
  });
});

app.post('/api/subjects', authenticateToken, (req, res) => {
  const { name, code, stream, class_level, description } = req.body;
  
  db.run('INSERT INTO subjects (name, code, stream, class_level, description) VALUES (?, ?, ?, ?, ?)',
    [name, code, stream, class_level, description],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, ...req.body });
    }
  );
});

// Marks routes
app.get('/api/marks/student/:studentId', authenticateToken, (req, res) => {
  const { term, year } = req.query;
  let query = `SELECT m.*, s.name as subject_name, s.code as subject_code, t.first_name as teacher_first_name, 
                t.last_name as teacher_last_name FROM marks m
                JOIN subjects s ON m.subject_id = s.id
                JOIN teachers t ON m.teacher_id = t.id
                WHERE m.student_id = ?`;
  const params = [req.params.studentId];

  if (term) {
    query += ' AND m.term = ?';
    params.push(term);
  }

  if (year) {
    query += ' AND m.year = ?';
    params.push(year);
  }

  db.all(query, params, (err, marks) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(marks);
  });
});

app.post('/api/marks', authenticateToken, (req, res) => {
  const { student_id, subject_id, teacher_id, term, year, assignment_marks, mid_term_marks, final_marks, comments } = req.body;
  
  const total_marks = (assignment_marks || 0) + (mid_term_marks || 0) + (final_marks || 0);
  let grade = 'F';
  
  if (total_marks >= 80) grade = 'A';
  else if (total_marks >= 70) grade = 'B';
  else if (total_marks >= 60) grade = 'C';
  else if (total_marks >= 50) grade = 'D';
  else if (total_marks >= 40) grade = 'E';

  db.run(`INSERT INTO marks (student_id, subject_id, teacher_id, term, year, assignment_marks, mid_term_marks, final_marks, total_marks, grade, comments)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [student_id, subject_id, teacher_id, term, year, assignment_marks, mid_term_marks, final_marks, total_marks, grade, comments],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, total_marks, grade });
    }
  );
});

// Messages routes
app.get('/api/messages', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  db.all(`SELECT m.*, u1.first_name as sender_first_name, u1.last_name as sender_last_name, 
          u2.first_name as receiver_first_name, u2.last_name as receiver_last_name
          FROM messages m
          JOIN users u1 ON m.sender_id = u1.id
          JOIN users u2 ON m.receiver_id = u2.id
          WHERE m.sender_id = ? OR m.receiver_id = ?
          ORDER BY m.created_at DESC`,
    [userId, userId],
    (err, messages) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(messages);
    }
  );
});

app.post('/api/messages', authenticateToken, (req, res) => {
  const { receiver_id, subject, message } = req.body;
  
  db.run('INSERT INTO messages (sender_id, receiver_id, subject, message) VALUES (?, ?, ?, ?)',
    [req.user.id, receiver_id, subject, message],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Create notification for receiver
      db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [receiver_id, 'New Message', subject || 'You have a new message', 'general']);
      
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Notifications routes
app.get('/api/notifications', authenticateToken, (req, res) => {
  db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, notifications) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(notifications);
    }
  );
});

app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Notification marked as read' });
  });
});

// Announcements routes
app.get('/api/announcements', (req, res) => {
  db.all('SELECT a.*, u.first_name as author_first_name, u.last_name as author_last_name FROM announcements a JOIN users u ON a.author_id = u.id ORDER BY a.created_at DESC LIMIT 10',
    (err, announcements) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(announcements);
    }
  );
});

app.post('/api/announcements', authenticateToken, (req, res) => {
  const { title, content, priority } = req.body;
  
  db.run('INSERT INTO announcements (title, content, author_id, priority) VALUES (?, ?, ?, ?)',
    [title, content, req.user.id, priority],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Notify all users
      db.all('SELECT id FROM users', [], (err, users) => {
        if (!err && users) {
          users.forEach(user => {
            db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
              [user.id, title, content.substring(0, 100), 'announcement']);
          });
        }
      });
      
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Events routes
app.get('/api/events', (req, res) => {
  db.all('SELECT * FROM events WHERE event_date >= date("now") ORDER BY event_date ASC LIMIT 10',
    (err, events) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(events);
    }
  );
});

app.post('/api/events', authenticateToken, (req, res) => {
  const { title, description, event_date, event_time, location, type } = req.body;
  
  db.run('INSERT INTO events (title, description, event_date, event_time, location, type) VALUES (?, ?, ?, ?, ?, ?)',
    [title, description, event_date, event_time, location, type],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Video sessions routes
app.get('/api/video-sessions', authenticateToken, (req, res) => {
  const { class_level, subject_id } = req.query;
  let query = `SELECT vs.*, s.name as subject_name, t.first_name as teacher_first_name, t.last_name as teacher_last_name 
               FROM video_sessions vs
               JOIN subjects s ON vs.subject_id = s.id
               JOIN teachers t ON vs.teacher_id = t.id
               WHERE vs.status != 'cancelled'`;
  const params = [];

  if (class_level) {
    query += ' AND vs.class_level = ?';
    params.push(class_level);
  }

  if (subject_id) {
    query += ' AND vs.subject_id = ?';
    params.push(subject_id);
  }

  query += ' ORDER BY vs.scheduled_date ASC';

  db.all(query, params, (err, sessions) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(sessions);
  });
});

app.post('/api/video-sessions', authenticateToken, (req, res) => {
  const { title, description, teacher_id, subject_id, class_level, scheduled_date, duration } = req.body;
  const meeting_id = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  db.run(`INSERT INTO video_sessions (title, description, teacher_id, subject_id, class_level, scheduled_date, duration, meeting_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, description, teacher_id, subject_id, class_level, scheduled_date, duration, meeting_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, meeting_id });
    }
  );
});

app.put('/api/video-sessions/:id/status', authenticateToken, (req, res) => {
  const { status, recording_url } = req.body;
  
  db.run('UPDATE video_sessions SET status = ?, recording_url = ? WHERE id = ?',
    [status, recording_url, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Session status updated' });
    }
  );
});

// Attendance routes
app.post('/api/attendance', authenticateToken, (req, res) => {
  const { student_id, session_id, status } = req.body;
  
  db.run(`INSERT INTO attendance (student_id, session_id, join_time, status)
          VALUES (?, ?, datetime('now'), ?)`,
    [student_id, session_id, status],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.put('/api/attendance/:id', authenticateToken, (req, res) => {
  const { leave_time, duration } = req.body;
  
  db.run('UPDATE attendance SET leave_time = ?, duration = ? WHERE id = ?',
    [leave_time, duration, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Attendance updated' });
    }
  );
});

// Application routes
app.post('/api/applications', (req, res) => {
  const { first_name, last_name, date_of_birth, gender, previous_school, parent_name, parent_phone, parent_email, address, stream_preference, class_level } = req.body;
  const application_number = 'APP' + Date.now();
  
  db.run(`INSERT INTO applications (application_number, first_name, last_name, date_of_birth, gender, previous_school, parent_name, parent_phone, parent_email, address, stream_preference, class_level)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [application_number, first_name, last_name, date_of_birth, gender, previous_school, parent_name, parent_phone, parent_email, address, stream_preference, class_level],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, application_number });
    }
  );
});

app.get('/api/applications/:number', (req, res) => {
  db.get('SELECT * FROM applications WHERE application_number = ?', [req.params.number], (err, application) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    res.json(application);
  });
});

// Gallery routes
app.get('/api/gallery', (req, res) => {
  const { category } = req.query;
  let query = 'SELECT * FROM gallery';
  const params = [];

  if (category) {
    query += ' WHERE category = ?';
    params.push(category);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, items) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(items);
  });
});

app.post('/api/gallery', authenticateToken, upload.single('file'), (req, res) => {
  const { title, description, category } = req.body;
  const file_type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  
  db.run('INSERT INTO gallery (title, description, file_path, file_type, category, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    [title, description, req.file.filename, file_type, category, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Fees routes
app.get('/api/fees/student/:studentId', authenticateToken, (req, res) => {
  db.all('SELECT * FROM fees WHERE student_id = ? ORDER BY year DESC, term DESC',
    [req.params.studentId],
    (err, fees) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(fees);
    }
  );
});

app.post('/api/fees', authenticateToken, (req, res) => {
  const { student_id, term, year, amount, due_date } = req.body;
  
  db.run('INSERT INTO fees (student_id, term, year, amount, balance, due_date) VALUES (?, ?, ?, ?, ?, ?)',
    [student_id, term, year, amount, amount, due_date],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
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
app.get('/api/assignments', (req, res) => {
  const query = `SELECT a.*, s.name as subject_name, t.first_name as teacher_first_name, t.last_name as teacher_last_name 
               FROM assignments a
               LEFT JOIN subjects s ON a.subject_id = s.id
               LEFT JOIN teachers t ON a.teacher_id = t.id
               ORDER BY a.created_at DESC`;

  db.all(query, [], (err, assignments) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(assignments);
  });
});

app.get('/api/assignments/teacher', authenticateToken, (req, res) => {
  db.all(`SELECT a.*, s.name as subject_name, COUNT(ass.id) as submission_count
          FROM assignments a
          LEFT JOIN subjects s ON a.subject_id = s.id
          LEFT JOIN assignment_submissions ass ON a.id = ass.assignment_id
          WHERE a.teacher_id = (SELECT id FROM teachers WHERE user_id = ?)
          GROUP BY a.id
          ORDER BY a.created_at DESC`,
    [req.user.id],
    (err, assignments) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(assignments);
    }
  );
});

app.get('/api/assignments/:id', authenticateToken, (req, res) => {
  db.get(`SELECT a.*, s.name as subject_name, t.first_name as teacher_first_name, t.last_name as teacher_last_name
          FROM assignments a
          LEFT JOIN subjects s ON a.subject_id = s.id
          LEFT JOIN teachers t ON a.teacher_id = t.id
          WHERE a.id = ?`,
    [req.params.id],
    (err, assignment) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
      res.json(assignment);
    }
  );
});

app.post('/api/assignments', upload.single('file'), (req, res) => {
  console.log('Creating assignment with data:', req.body);
  console.log('File:', req.file);
  
  const { teacher_name, subject_name, subject_id, class_level, stream, title, description, due_date, total_marks } = req.body;
  const file_path = req.file ? req.file.filename : null;
  
  // For demo purposes, use teacher_id = 1 if no authentication
  const teacherId = 1;
  
  db.run(`INSERT INTO assignments (teacher_id, teacher_name, subject_id, subject_name, class_level, stream, title, description, file_path, due_date, total_marks)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [teacherId, teacher_name, subject_id, subject_name, class_level, stream, title, description, file_path, due_date, total_marks],
    function(err) {
      if (err) {
        console.error('Error creating assignment:', err.message);
        return res.status(500).json({ error: err.message });
      }
      
      console.log('Assignment created with ID:', this.lastID);
      
      // Notify students in the class
      db.all('SELECT user_id FROM students WHERE class_level = ? AND (stream = ? OR stream = "both")',
        [class_level, stream],
        (err, students) => {
          if (!err && students && students.length > 0) {
            students.forEach(student => {
              db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                [student.user_id, 'New Assignment', `${title} - Due: ${due_date}`, 'assignment']);
            });
          }
        }
      );
      
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.get('/api/assignments/:id/submissions', authenticateToken, (req, res) => {
  db.all(`SELECT ass.*, st.first_name as student_first_name, st.last_name as student_last_name, st.student_id
          FROM assignment_submissions ass
          JOIN students st ON ass.student_id = st.id
          WHERE ass.assignment_id = ?
          ORDER BY ass.submitted_at DESC`,
    [req.params.id],
    (err, submissions) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(submissions);
    }
  );
});

app.post('/api/assignments/:id/submit', authenticateToken, upload.single('file'), (req, res) => {
  const { submission_text } = req.body;
  const file_path = req.file ? req.file.filename : null;
  
  // Get student_id from user_id
  db.get('SELECT id FROM students WHERE user_id = ?', [req.user.id], (err, student) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Check if already submitted
    db.get('SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?',
      [req.params.id, student.id],
      (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) return res.status(400).json({ error: 'Already submitted' });

        db.run(`INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, file_path)
                VALUES (?, ?, ?, ?)`,
          [req.params.id, student.id, submission_text, file_path],
          function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Notify teacher
            db.get('SELECT user_id FROM assignments a JOIN teachers t ON a.teacher_id = t.id WHERE a.id = ?',
              [req.params.id],
              (err, assignment) => {
                if (!err && assignment) {
                  db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                    [assignment.user_id, 'Assignment Submitted', 'A student has submitted an assignment', 'general']);
                }
              }
            );
            
            res.status(201).json({ id: this.lastID });
          }
        );
      }
    );
  });
});

app.put('/api/assignments/:id', upload.single('file'), (req, res) => {
  const { teacher_name, subject_name, subject_id, class_level, stream, title, description, due_date, total_marks } = req.body;
  const file_path = req.file ? req.file.filename : null;
  
  const updateQuery = file_path 
    ? `UPDATE assignments SET teacher_name = ?, subject_id = ?, subject_name = ?, class_level = ?, stream = ?, title = ?, description = ?, file_path = ?, due_date = ?, total_marks = ? WHERE id = ?`
    : `UPDATE assignments SET teacher_name = ?, subject_id = ?, subject_name = ?, class_level = ?, stream = ?, title = ?, description = ?, due_date = ?, total_marks = ? WHERE id = ?`;
  
  const params = file_path
    ? [teacher_name, subject_id, subject_name, class_level, stream, title, description, file_path, due_date, total_marks, req.params.id]
    : [teacher_name, subject_id, subject_name, class_level, stream, title, description, due_date, total_marks, req.params.id];
  
  db.run(updateQuery, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Assignment updated successfully' });
  });
});

app.delete('/api/assignments/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM assignments WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Assignment deleted successfully' });
  });
});

app.put('/api/assignments/:id/grade', authenticateToken, (req, res) => {
  const { submission_id, marks, grade, feedback, status } = req.body;
  
  const finalStatus = status || 'graded';
  const notificationMessage = status === 'approved' ? 'Your assignment has been approved!' :
                            status === 'rejected' ? 'Your assignment needs changes. Please review feedback.' :
                            status === 'failed' ? 'Your assignment has been marked as failed.' :
                            `Your assignment has been graded. Grade: ${grade}`;
  
  db.run(`UPDATE assignment_submissions SET marks = ?, grade = ?, feedback = ?, status = ?
          WHERE id = ?`,
    [marks, grade, feedback, finalStatus, submission_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Notify student
      db.get('SELECT user_id FROM assignment_submissions ass JOIN students st ON ass.student_id = st.id WHERE ass.id = ?',
        [submission_id],
        (err, submission) => {
          if (!err && submission) {
            db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
              [submission.user_id, 'Assignment Updated', notificationMessage, 'grade']);
          }
        }
      );
      
      res.json({ message: 'Submission updated successfully' });
    }
  );
});

app.get('/api/assignments/:id/my-submission', authenticateToken, (req, res) => {
  db.get('SELECT id FROM students WHERE user_id = ?', [req.user.id], (err, student) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    db.get('SELECT * FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?',
      [req.params.id, student.id],
      (err, submission) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!submission) return res.status(404).json({ error: 'No submission found' });
        res.json(submission);
      }
    );
  });
});

// Get statistics for dashboard
app.get('/api/statistics', authenticateToken, (req, res) => {
  const queries = [
    'SELECT COUNT(*) as count FROM students WHERE status = "active"',
    'SELECT COUNT(*) as count FROM teachers WHERE status = "active"',
    'SELECT COUNT(*) as count FROM subjects',
    'SELECT COUNT(*) as count FROM video_sessions WHERE status = "scheduled"'
  ];

  Promise.all(queries.map(query => 
    new Promise((resolve, reject) => {
      db.get(query, (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    })
  )).then(results => {
    res.json({
      students: results[0],
      teachers: results[1],
      subjects: results[2],
      sessions: results[3]
    });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

// AI Chat endpoint - Using Groq API with OpenAI SDK
app.post('/api/ai/chat', async (req, res) => {
  const { message, conversationHistory } = req.body;
  
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return res.status(500).json({ error: 'Groq API key not configured' });
    }

    const openai = new OpenAI({
      apiKey: groqApiKey,
      baseURL: 'https://api.groq.com/openai/v1'
    });

    const systemPrompt = 'You are John Enow AI, a helpful educational assistant for students. Answer questions directly, clearly, and accurately. Provide explanations, formulas, definitions, and examples when helpful. Be concise but thorough. If asked for a formula, provide it clearly. If asked for a definition, give a clear, accurate definition. Help students understand concepts across all subjects.';
    
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...(conversationHistory || []).map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    console.log('Attempting Groq API call with OpenAI SDK...');
    const completion = await openai.chat.completions.create({
      model: 'llama3-groq-8b-8192-tool-use-preview',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7
    });

    if (completion.choices && completion.choices[0]) {
      res.json({ response: completion.choices[0].message.content });
    } else {
      res.status(500).json({ error: 'Invalid response from Groq API' });
    }
  } catch (error) {
    console.error('Groq API error:', error.message);
    console.error('Groq API error details:', error);
    res.status(500).json({ error: 'Failed to get response from AI: ' + error.message });
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
  socket.on('private_message', (data) => {
    const { senderId, receiverId, message, senderName } = data;
    
    // Store message in database
    db.run(`INSERT INTO messages (sender_id, receiver_id, message, sender_name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [senderId, receiverId, message, senderName],
      function(err) {
        if (err) {
          console.error('Error storing message:', err);
          return;
        }
        
        // Send to receiver if online
        io.to(receiverId).emit('receive_message', {
          id: this.lastID,
          sender_id: senderId,
          receiver_id: receiverId,
          message: message,
          sender_name: senderName,
          created_at: new Date().toISOString()
        });
        
        // Send confirmation to sender
        socket.emit('message_sent', {
          id: this.lastID,
          sender_id: senderId,
          receiver_id: receiverId,
          message: message,
          sender_name: senderName,
          created_at: new Date().toISOString()
        });
      }
    );
  });

  // Join a room for group/class messaging
  socket.on('join_class', (classLevel) => {
    socket.join(`class_${classLevel}`);
    console.log(`User joined class room: class_${classLevel}`);
  });

  // Send class-wide message
  socket.on('class_message', (data) => {
    const { senderId, classLevel, message, senderName } = data;
    
    db.run(`INSERT INTO class_messages (sender_id, class_level, message, sender_name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [senderId, classLevel, message, senderName],
      function(err) {
        if (err) {
          console.error('Error storing class message:', err);
          return;
        }
        
        // Broadcast to class room
        io.to(`class_${classLevel}`).emit('receive_class_message', {
          id: this.lastID,
          sender_id: senderId,
          class_level: classLevel,
          message: message,
          sender_name: senderName,
          created_at: new Date().toISOString()
        });
      }
    );
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Messages API endpoints
app.get('/api/messages/:userId', authenticateToken, (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;
  
  db.all(`SELECT * FROM messages 
          WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
          ORDER BY created_at ASC`,
    [currentUserId, userId, userId, currentUserId],
    (err, messages) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(messages);
    }
  );
});

app.get('/api/messages/conversations', authenticateToken, (req, res) => {
  const currentUserId = req.user.id;
  
  db.all(`SELECT DISTINCT 
          CASE 
            WHEN sender_id = ? THEN receiver_id 
            ELSE sender_id 
          END as other_user_id,
          MAX(created_at) as last_message_time
          FROM messages
          WHERE sender_id = ? OR receiver_id = ?
          GROUP BY other_user_id
          ORDER BY last_message_time DESC`,
    [currentUserId, currentUserId, currentUserId],
    (err, conversations) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(conversations);
    }
  );
});

app.get('/api/class-messages/:classLevel', authenticateToken, (req, res) => {
  const { classLevel } = req.params;
  
  db.all(`SELECT * FROM class_messages WHERE class_level = ? ORDER BY created_at ASC`,
    [classLevel],
    (err, messages) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(messages);
    }
  );
});