import { RouterProvider } from 'react-router-dom';
import { OfflineBanner } from './components/OfflineBanner';
import { router } from './app/router';

export function App() {
  return (
    <>
      <OfflineBanner />
      <RouterProvider router={router} />
    </>
  );
}
