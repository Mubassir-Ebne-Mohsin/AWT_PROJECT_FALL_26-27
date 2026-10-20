// Runs before the app config is parsed. E2E tests use a separate database so
// they can truncate tables freely; migrations are applied by the test itself.
process.env.NODE_ENV = "test";
process.env.DB_DATABASE = process.env.DB_TEST_DATABASE ?? "stressforge_test";
process.env.JWT_ACCESS_SECRET ??= "e2e-test-access-secret-0123456789abcdef";
process.env.JWT_REFRESH_SECRET ??= "e2e-test-refresh-secret-0123456789abcdef";
process.env.AUTH_THROTTLE_LIMIT = "50";
process.env.THROTTLE_LIMIT = "10000";
