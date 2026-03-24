const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
const logDir = path.join(__dirname, '..', 'logs');

// JSON format for prod (machine-readable), simple format for dev (human-readable)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} ${level.toUpperCase()}${rid} ${message}${extra}`;
  })
);

const transports = [
  new winston.transports.Console({
    level: isProd ? 'warn' : 'debug',
    format: isProd ? prodFormat : devFormat,
  })
];

// In production, write to rotating log files
if (isProd) {
  // Combined log — all levels (info and above)
  transports.push(new DailyRotateFile({
    dirname: logDir,
    filename: 'app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    level: 'info',
    format: prodFormat,
  }));

  // Error log — errors only
  transports.push(new DailyRotateFile({
    dirname: logDir,
    filename: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
    format: prodFormat,
  }));
}

const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  transports,
  // Don't crash on logging errors
  exitOnError: false,
});

module.exports = logger;
