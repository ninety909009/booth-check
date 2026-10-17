// js/ 파일은 index.html 순서대로 실행돼요. 파일을 불러오는 도중 바로 실행되는 코드가
// 뒤쪽 파일의 함수를 (직접이든 다른 함수를 거쳐서든) 부르면 앱이 시작하다 멈춰요. 그걸 미리 잡는 검사예요.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const walk = require("acorn-walk");

const ROOT = path.join(__dirname, "..");
const files = [...fs.readFileSync(path.join(ROOT, "index.html"), "utf8").matchAll(/<script src="(js\/[\w.-]+\.js)"><\/script>/g)].map(
  (m) => m[1]
);
// 이 함수에 넘긴 콜백은 나중에 실행되므로 "지금 실행"으로 치지 않음
const LATER = new Set([
  "addEventListener",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "onSnapshot",
  "onAuthStateChanged",
  "then",
  "catch",
  "register",
]);

test("js 파일 순서: 불러오는 도중 뒤쪽 파일의 함수를 부르지 않는다", () => {
  expect(files.length).toBeGreaterThan(0);
  const funcs = {};
  const stmts = [];
  files.forEach((f, idx) => {
    const ast = acorn.parse(fs.readFileSync(path.join(ROOT, f), "utf8"), { ecmaVersion: "latest", locations: true });
    for (const st of ast.body) {
      if (st.type === "FunctionDeclaration") funcs[st.id.name] = { idx, file: f, node: st };
      else stmts.push({ idx, file: f, node: st });
    }
  });
  const refs = (node, onlyNow) => {
    const out = new Set();
    walk.fullAncestor(node, (n, _s, anc) => {
      if (n.type !== "Identifier" || !funcs[n.name]) return;
      if (onlyNow) {
        const par = anc[anc.length - 2];
        const callName = (c) => (c.type === "MemberExpression" ? c.property.name : c.name);
        if (par && par.type === "CallExpression" && par.arguments.includes(n) && LATER.has(callName(par.callee))) return;
        for (let i = anc.length - 2; i >= 0; i--) {
          const a = anc[i];
          if (a.type !== "ArrowFunctionExpression" && a.type !== "FunctionExpression") continue;
          const p = anc[i - 1];
          if (p && p.type === "CallExpression" && p.callee === a) continue; // 바로 실행되는 함수
          if (p && p.type === "CallExpression" && !LATER.has(callName(p.callee))) continue; // map 같은 콜백도 지금 실행
          return; // 저장해 두거나 나중에 실행되는 함수
        }
      }
      out.add(n.name);
    });
    return out;
  };
  for (const f of Object.values(funcs)) f.refs = refs(f.node.body, false);
  const problems = new Set();
  for (const s of stmts) {
    const seen = new Set(),
      stack = [...refs(s.node, true)];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...funcs[n].refs);
    }
    for (const n of seen) if (funcs[n].idx > s.idx) problems.add(`${s.file}:${s.node.loc.start.line} → ${n}() (${funcs[n].file})`);
  }
  expect([...problems]).toEqual([]);
});
