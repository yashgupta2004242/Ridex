import { createBrowserRouter } from 'react-router-dom';
import { AdminOpsPage } from '../features/admin/AdminOpsPage';
import { AdminQueuePage } from '../features/admin/AdminQueuePage';
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { DriverHomePage } from '../features/driver/DriverHomePage';
import { DriverOnboardingPage } from '../features/driver/DriverOnboardingPage';
import { EarningsPage } from '../features/driver/EarningsPage';
import { HomePage } from '../features/home/HomePage';
import { EstimatePage } from '../features/ride/EstimatePage';
import { HistoryPage } from '../features/ride/HistoryPage';
import { ReceiptPage } from '../features/ride/ReceiptPage';
import { RidePage } from '../features/ride/RidePage';
import { SupportPage } from '../features/support/SupportPage';
import { ProfilePage } from '../features/user/ProfilePage';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '/profile', element: <ProfilePage /> },
  { path: '/estimate', element: <EstimatePage /> },
  { path: '/rides/:id', element: <RidePage /> },
  { path: '/rides/:id/receipt', element: <ReceiptPage /> },
  { path: '/history', element: <HistoryPage /> },
  { path: '/support', element: <SupportPage /> },
  { path: '/drive', element: <DriverHomePage /> },
  { path: '/driver', element: <DriverOnboardingPage /> },
  { path: '/earnings', element: <EarningsPage /> },
  { path: '/admin', element: <AdminQueuePage /> },
  { path: '/admin/ops', element: <AdminOpsPage /> },
]);
