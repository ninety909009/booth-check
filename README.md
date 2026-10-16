# 부스 체크

동인 행사 부스를 미리 정리하고, 당일 선입금 수령·현장 구매를 체크하는 웹앱입니다.

- 파일 하나(`index.html`)로 돌아가요. 서버 없이 GitHub Pages로 배포할 수 있어요.
- 로그인하지 않으면 데이터는 각자 브라우저(localStorage)에만 저장돼요.

## 홈 화면 설치 · 오프라인

- 안드로이드 크롬: 설정(톱니바퀴) → ‘앱 설치’ 카드의 **홈 화면에 설치** 버튼, 또는 브라우저 메뉴 → 앱 설치.
- 아이폰 사파리: 공유 버튼 → **홈 화면에 추가**.
- 한 번 열어 두면 그 뒤로는 인터넷이 끊겨도 앱이 열려요. 새 버전은 인터넷이 될 때 열면 자동으로 받아요.

## 실시간 공유 방식

| 코드 | 받은 사람이 할 수 있는 것 |
|---|---|
| `BCL-XXXXXXXX` (구독 코드·링크) | 원본이 바뀌면 자동 업데이트. 부스·작가 정보, 수령 방법, 태그·부스 메모, 무료 배포 물품은 읽기 전용, 나머지 구매 리스트·체크·지인·내 메모는 각자 것 |
| `BCE-XXXXXXXX-…` (편집 코드·링크) | 로그인 후 공동 편집자로 참여. 고친 내용이 모두에게 반영 |

- 공유되는 것: 행사 정보·일정·구역·상품 종류·배치도·부스·태그·부스 메모·작가·인포 이미지 링크·선입금·수요조사 기간과 폼 링크·수령 방법·무료 배포 물품(이름·종류·샘플).
- 공유 안 되는 것: 무료 배포를 뺀 구매 리스트(물품·가격), 모든 물품의 체크·수량, 지인, 구독자의 ‘내 메모’.
- 원본에서 부스를 지워도, 구독자가 물품·메모를 남긴 부스는 그 사람의 부스로 남아요.
- 카카오톡 안의 브라우저에서는 Google 로그인이 막혀 있어요. 구독(BCL)은 로그인 없이 돼요.

## 개발

앱은 여전히 `index.html` 하나로 돌아가요. 아래 도구는 개발할 때만 써요(배포에는 필요 없어요).

```bash
npm install          # 처음 한 번
npm test             # Playwright 테스트 (Chromium)
npm run serve        # http://localhost:8123 에서 확인
npm run format       # Prettier로 정리 (커밋 전에)
```

- 테스트는 `tests/`에 있어요. 주소에 `?bctest`를 붙여 열 때만 내부 함수가 `window.__bcTest`로 노출돼서, 테스트가 그걸로 순수 함수(병합·코드 해석·윗치폼 붙여넣기 등)를 확인해요.
- 큰 포맷 커밋은 `git blame`에서 빼 두었어요: `git config blame.ignoreRevsFile .git-blame-ignore-revs`
- `sw.js`를 바꾸면 맨 위 `VER`(예: `bc-v3`)를 올려 주세요. 옛 저장본이 지워져요.

## Firebase 운영 메모

- `firestore.rules`를 바꾸면 Firebase 콘솔 → Firestore → 규칙에 붙여 넣거나 `firebase deploy --only firestore:rules`로 올려요.
- `firebase-config.js`의 apiKey는 공개돼도 되는 값이에요. 대신 남용을 막으려면:
  1. **App Check (선택)**: Firebase 콘솔 → App Check에서 웹 앱에 reCAPTCHA v3를 등록하고, 받은 사이트 키를 `firebase-config.js`에 `appCheckKey: "..."`로 넣어요. 키가 없으면 지금처럼 동작해요. 넣은 뒤 콘솔에서 Firestore **적용(Enforce)**을 켜야 실제로 막혀요(켜기 전에 콘솔 지표로 정상 요청이 통과하는지 먼저 확인).
  2. **API 키 제한**: Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보 → 해당 키 → 웹사이트 제한에 배포 주소(예: `https://<아이디>.github.io/*`)와 `https://checkthebooth.firebaseapp.com/*`를 넣어요.
  3. **예산 알림**: Google Cloud 콘솔 → 결제 → 예산 및 알림.
