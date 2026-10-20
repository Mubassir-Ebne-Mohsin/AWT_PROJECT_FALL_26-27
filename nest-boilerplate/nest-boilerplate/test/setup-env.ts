// Jest runs with NODE_ENV=test; supply required config so unit tests don't need a .env file.
process.env.NODE_ENV = "test";
process.env.DB_USER ??= "test";
process.env.DB_PASSWORD ??= "test";
process.env.DB_DATABASE ??= "test";
process.env.JWT_ACCESS_SECRET ??= "unit-test-access-secret-0123456789abcdef";
process.env.JWT_REFRESH_SECRET ??= "unit-test-refresh-secret-0123456789abcdef";
