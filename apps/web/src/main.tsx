import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 토큰을 먼저 불러 변수를 정의한 뒤 그것을 참조하는 스타일을 얹는다.
//
// 왜 App보다 먼저 들여오는가: 번들러는 모듈 평가 순서대로 CSS를 잇는다. App을 먼저 들여오면
// 화면별 CSS가 app.css보다 앞서 붙고, 같은 명시도(단일 클래스)가 부딪힐 때 공용 기본값이
// 화면의 조정값을 이긴다. 공용 클래스(.card/.table/.chip/.input)를 app.css로 올린 뒤로는
// 그 충돌이 실제로 생기므로, "공용이 먼저 · 화면이 나중"을 파일 순서로 고정한다.
import './styles/tokens.css';
import './styles/app.css';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
