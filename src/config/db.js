import mongoose from 'mongoose';

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI environment variable is missing.');
  }

  if (!cached.promise) {
    const isServerless = process.env.VERCEL === '1';
    
    const opts = {
      bufferCommands: false,
      maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || (isServerless ? '20' : '100'), 10),
      minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || (isServerless ? '0' : '10'), 10),
      maxIdleTimeMS: parseInt(process.env.MONGO_MAX_IDLE_TIME_MS || '30000', 10),
      serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '5000', 10),
      connectTimeoutMS: parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || '5000', 10),
      socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || '45000', 10),
    };

    cached.promise = mongoose.connect(mongoUri, opts).then((mongooseInstance) => {
      console.log(`[MongoDB] Connected successfully to host: ${mongooseInstance.connection.host} (maxPoolSize: ${opts.maxPoolSize})`);
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error(`[MongoDB] Connection Error: ${e.message}`);
    throw e;
  }

  return cached.conn;
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
    console.log('[MongoDB] Disconnected gracefully.');
  }
};

