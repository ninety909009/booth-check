// 부스 체크 — Firebase 설정
// Firebase 콘솔 → 프로젝트 설정(톱니바퀴) → 일반 → 내 앱 → 웹 앱 → "SDK 설정 및 구성"의 "구성" 값을 아래에 그대로 옮겨 적으세요.
// 이 값들은 공개돼도 괜찮은 값이에요. 데이터 보호는 Firestore 보안 규칙(firestore.rules)이 맡아요.
// 비워 두면 로그인·실시간 공유 없이 지금처럼 이 기기에서만 동작해요.
window.BOOTHCHECK_FIREBASE = {
  apiKey: "AIzaSyDxY5NJrYBLKJKdej8xVFAhStRXWwY00BA",
  authDomain: "checkthebooth.firebaseapp.com",
  projectId: "checkthebooth",
  storageBucket: "checkthebooth.firebasestorage.app",
  messagingSenderId: "158365869217",
  appId: "1:158365869217:web:5af19563b85bbfd25bfce0"
};
