import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';
import { getConfig } from '../../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../../src/database/connection.js';

/**
 * Connects the current test file to its worker database and starts from an empty state.
 * Fails loudly when MongoDB is not reachable: the suite never runs against a fake.
 */
export function useTestDatabase() {
  beforeAll(async () => {
    await connectDatabase(getConfig().mongoUri, { serverSelectionTimeoutMS: 3000 });
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });
}
