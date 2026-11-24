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
    const models = Object.values(mongoose.models);
    // Mongoose starts building indexes as soon as it connects. Wait for that to finish
    // before touching the data, otherwise the cleanup below can race with index creation.
    await Promise.all(models.map((model) => model.init()));
    // Empty the collections instead of dropping the database: a leftover from an
    // interrupted run is removed, while the indexes that were just built stay in place.
    await Promise.all(models.map((model) => model.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });
}
