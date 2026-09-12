import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// 토큰을 먼저 불러 변수를 정의한 뒤 그것을 참조하는 스타일을 얹는다.
import './styles/tokens.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
