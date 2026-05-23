'use strict';

const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, skill, jobId, error, ...meta }) => {
  const skillTag = skill ? ` [${skill}]` : '';
  const jobTag = jobId ? ` (job:${jobId})` : '';
  const errorStack = error?.stack ? `\n${error.stack}` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp}${skillTag}${jobTag} ${level}: ${message}${metaStr}${errorStack}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
  transports: [
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logsDir, 'all-activities.log') }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), logFormat),
  }));
}

logger.forSkill = (skillName) => logger.child({ skill: skillName });

module.exports = logger;
