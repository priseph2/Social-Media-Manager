'use strict';

const mongoose = require('mongoose');
const logger = require('../../utils/logger');

let isConnected = false;

async function connectMongoDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.warn('MONGODB_URI not set — content history and customer data storage disabled.');
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
      maxIdleTimeMS: 60000,
      waitQueueTimeoutMS: 10000,
    });
    isConnected = true;
    logger.info('MongoDB Atlas connected');

    mongoose.connection.on('error', (err) => logger.error('MongoDB error', { error: err }));
    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err });
  }
}

async function closeMongoDB() {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
  }
}

function isMongoAvailable() {
  return isConnected;
}

module.exports = { connectMongoDB, closeMongoDB, isMongoAvailable };
