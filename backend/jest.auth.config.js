module.exports = {
  rootDir: "src",
  testRegex: [
    "modules/extensions/performance/.*\\.spec\\.ts$",
    "common/(auth/session\\.util|guards/auth\\.guard)\\.spec\\.ts$",
  ],
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  testEnvironment: "node",
};
