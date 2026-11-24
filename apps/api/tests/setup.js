// Each Vitest worker gets its own database so test files can run in parallel.
const worker = process.env.VITEST_POOL_ID ?? '0';
process.env.MONGODB_URI = `${process.env.MONGODB_TEST_BASE}/personalitify_test_${worker}`;
