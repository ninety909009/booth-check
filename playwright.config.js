// 테스트 설정: 로컬 서버(http-server)로 index.html을 띄우고 Chromium으로 확인해요.
const { defineConfig } = require("@playwright/test");

const PORT = 8123;
module.exports = defineConfig({
  testDir: "tests",
  timeout: 30000,
  use: {
    baseURL: `http://localhost:${PORT}/`,
    serviceWorkers: "block",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  webServer: {
    command: `npx http-server -p ${PORT} -c-1 -s .`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
