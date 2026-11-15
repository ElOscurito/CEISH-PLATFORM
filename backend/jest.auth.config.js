module.exports = {
  rootDir: "src",
  testRegex: "(common/(auth/session\\.util|guards/auth\\.guard)|modules/extensions/dynamic-forms/dynamic-forms(\\.workflow|\\.http)?)\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  testEnvironment: "node",
};
