import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { store } from './app/store';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SocketProvider } from './features/realtime/useSocket';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root is missing');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <SocketProvider>
          <App />
        </SocketProvider>
      </Provider>
    </ErrorBoundary>
  </StrictMode>,
);
