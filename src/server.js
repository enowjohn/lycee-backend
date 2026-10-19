const http = require('http');
const socketIo = require('socket.io');
const app = require('./app');
const { corsOrigin } = require('./config/cors');
require('./db/connection'); // opens the MongoDB connection
const registerSocketHandlers = require('./sockets');

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.set('io', io);
registerSocketHandlers(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = server;
