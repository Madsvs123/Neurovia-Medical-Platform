// Load configuration first
const { config, validateConfig } = require('./config/config');

// Validate required configuration
validateConfig();

// Import required modules
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { isServerless, saveToBlobs, readUpload } = require('./utils/fileStorage');

const serverless = isServerless();

// Configure Winston logger. On Netlify the filesystem is read-only, so logs
// go to the console only (they show up in the function logs).
const defaultTransports = [new winston.transports.Console()];
const exceptionHandlers = [];
const rejectionHandlers = [];

if (!serverless) {
  const DailyRotateFile = require('winston-daily-rotate-file');

  // Create logs directory if it doesn't exist
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  const rotating = (name, extra = {}) => new DailyRotateFile({
    filename: path.join(logsDir, `${name}-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    ...extra
  });

  defaultTransports.push(rotating('error', { level: 'error' }), rotating('combined'));
  exceptionHandlers.push(rotating('exceptions'));
  rejectionHandlers.push(rotating('rejections'));
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: defaultTransports,
  ...(serverless ? {} : { exceptionHandlers, rejectionHandlers })
});

// Ensure the default/global winston logger has transports too so other modules
// that call `winston.info()` will not attempt to write with no transports.
winston.configure({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: defaultTransports,
  ...(serverless ? {} : { exceptionHandlers, rejectionHandlers })
});

const app = express();

if (serverless) {
  // Requests reach the function through Netlify's proxy.
  app.set('trust proxy', 1);

  // Requests rewritten to the function may arrive with the function path
  // (`/.netlify/functions/api/users`); map them back to `/api/users`.
  app.use((req, res, next) => {
    const prefix = '/.netlify/functions/api';
    if (req.url.startsWith(prefix)) {
      req.url = '/api' + (req.url.slice(prefix.length) || '/');
    }
    next();
  });
}

// Middleware
// Security headers
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: config.security.cors.allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'x-requested-with']
};
app.use(cors(corsOptions));

// Rate limiting
// Notification endpoints are polled while a tab is open, so they get a
// looser limiter than the rest of the API.
const limiter = rateLimit({
  windowMs: config.security.rateLimiting.windowMs,
  max: config.security.rateLimiting.max,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

const pollingLimiter = rateLimit({
  windowMs: config.security.pollingRateLimiting.windowMs,
  max: config.security.pollingRateLimiting.max,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/notifications', pollingLimiter);
app.use(limiter);

// Body parser
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Cookie parser
app.use(cookieParser());

// Sanitize data
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Compression (Netlify's CDN already compresses function responses)
if (!serverless) {
  app.use(compression());
}

// Request logging
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// File uploads (general)
const { upload, videoUpload } = require('./middleware/uploadMiddleware');

const uploadResponse = async (req, res, next) => {
  try {
    const file = serverless
      ? await saveToBlobs(req.file)
      : { ...req.file, path: `/api/uploads/${req.file.filename}` };
    res.json({ success: true, file });
  } catch (err) {
    next(err);
  }
};

app.post('/api/uploads', upload.single('file'), (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  uploadResponse(req, res, next);
});

// Video uploads (separate endpoint with larger limit)
app.post('/api/uploads/video', videoUpload.single('video'), (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No video uploaded' });
  }
  uploadResponse(req, res, next);
});

// Serve uploaded files
app.get('/api/uploads/:key', async (req, res, next) => {
  try {
    const key = path.basename(req.params.key);
    const stored = await readUpload(key);
    if (!stored) {
      return res.status(404).json({ message: 'File not found' });
    }
    if (stored.filePath) {
      return res.sendFile(stored.filePath);
    }
    res.set('Content-Type', stored.contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(stored.data);
  } catch (err) {
    next(err);
  }
});

// Routes
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const courseRoutes = require('./routes/courseRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const quizRoutes = require('./routes/quizRoutes');
const flashcardRoutes = require('./routes/flashcardRoutes');
const clinicalCaseRoutes = require('./routes/clinicalCaseRoutes');
const programRoutes = require('./routes/programRoutes');
const programEnrollmentRoutes = require('./routes/programEnrollmentRoutes');
const programResourceRoutes = require('./routes/programResourceRoutes');
const subscriptionPlanRoutes = require('./routes/subscriptionPlanRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const diseaseRoutes = require('./routes/diseaseRoutes');
const medicationRoutes = require('./routes/medicationRoutes');
const symptomRoutes = require('./routes/symptomRoutes');
const doctorToolRoutes = require('./routes/doctorToolRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');

// Basic route
const welcome = (req, res) => {
  res.json({
    status: 'ok',
    message: 'Welcome to Neurovia API - AI-Powered Medical Education Platform',
  });
};
app.get('/', welcome);
app.get('/api', welcome);

// API routes
app.use('/api/users', userRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/flashcards', flashcardRoutes);
app.use('/api/clinical-cases', clinicalCaseRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/subscription-plans', subscriptionPlanRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/diseases', diseaseRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/symptoms', symptomRoutes);
app.use('/api/doctor-tools', doctorToolRoutes);
app.use('/api/program-enrollments', programEnrollmentRoutes);
app.use('/api/program-resources', programResourceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activity-logs', activityLogRoutes);

// Import middleware
const { errorHandler, notFoundHandler, requestLogger } = require('./middleware/errorMiddleware');

// Request logging
app.use(requestLogger);

// 404 Not Found handler
app.use(notFoundHandler);

// Error handling middleware
app.use(errorHandler);

module.exports = app;
