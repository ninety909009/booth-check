// 바깥 인터넷(Firebase·글꼴)은 막고, 앱 내부 함수(window.__bcTest)를 쓸 수 있게 열어요.
async function openApp(page, opts = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto(opts.query === undefined ? "index.html?bctest" : "index.html" + opts.query);
  await page.waitForSelector("#top");
  return errors;
}
module.exports = { openApp };
