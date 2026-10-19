// Shared CORS allow-list for both the Express app (src/app.js) and the
// Socket.IO server (src/server.js). The public site plus the Vercel
// preview domains and local development are allowed; any extra origins can
// be supplied through FRONTEND_URL / CLIENTURL / CLIENT_URL (comma separated).

const DEFAULT_ORIGINS = [
  'https://gbhsombessa.site',
  'https://www.gbhsombessa.site',
  'https://lycee-frontend.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

function extraOrigins() {
  return [process.env.FRONTEND_URL, process.env.CLIENTURL, process.env.CLIENT_URL]
    .filter(Boolean)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  // Non-browser clients (curl, mobile apps) send no Origin header.
  if (!origin) return true;
  if ([...DEFAULT_ORIGINS, ...extraOrigins()].includes(origin)) return true;
  try {
    // Any preview/production deployment of this project on Vercel.
    if (new URL(origin).hostname.endsWith('.vercel.app')) return true;
  } catch (error) {
    /* malformed Origin header — reject below */
  }
  return false;
}

// cors / socket.io option callback: (origin, callback) => callback(err, allowed).
function corsOrigin(origin, callback) {
  callback(null, isAllowedOrigin(origin));
}

module.exports = { isAllowedOrigin, corsOrigin, DEFAULT_ORIGINS };
