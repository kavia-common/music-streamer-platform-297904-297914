const cors = require('cors');
const express = require('express');
const routes = require('./routes');
const apiRoutes = require('./routes/api');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');
const { bootstrapSchema } = require('./lib/supabase');
const { tokenFromQueryToHeader } = require('./middleware/streamAuth');

// Initialize express app
const app = express();

// CORS: allow frontend at 3000
app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all for dev
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.set('trust proxy', true);

// Swagger docs (dynamic server URL)
app.use('/docs', swaggerUi.serve, (req, res, next) => {
  const host = req.get('host');
  let protocol = req.protocol;

  const actualPort = req.socket.localPort;
  const hasPort = host.includes(':');

  const needsPort =
    !hasPort &&
    ((protocol === 'http' && actualPort !== 80) ||
     (protocol === 'https' && actualPort !== 443));
  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = req.secure ? 'https' : protocol;

  const dynamicSpec = {
    ...swaggerSpec,
    servers: [
      { url: `${protocol}://${fullHost}` },
    ],
  };
  swaggerUi.setup(dynamicSpec)(req, res, next);
});

// Parse JSON request body
app.use(express.json());

// Health/base routes
app.use('/', routes);

// API routes (protected features)
app.use('/api/tracks', tokenFromQueryToHeader); // allow ?token= for stream
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
  });
});

// Attempt lightweight schema bootstrap on startup (non-blocking)
bootstrapSchema().catch(() => {});

module.exports = app;
