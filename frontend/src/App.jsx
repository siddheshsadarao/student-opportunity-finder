/**
 * Application routes and the guards that protect them.
 *
 * Route groups:
 *   public      -> landing page, login, register, opportunity details
 *   student     -> everything inside StudentLayout (requires a student token)
 *   admin       -> everything inside AdminLayout  (requires an admin token)
 *
 * The guards are ordinary components. <ProtectedRoute> checks the auth state
 * from context and either renders the page or redirects to /login.
 */
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext';
import { PageLoader } from './components/ui';

const StudentLayout = lazy(() => import('./components/layout/StudentLayout'));
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const AdminLogin = lazy(() => import('./pages/auth/AdminLogin'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const OpportunityDetails = lazy(() => import('./pages/OpportunityDetails'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Discover = lazy(() => import('./pages/Discover'));
const Recommended = lazy(() => import('./pages/Recommended'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const Saved = lazy(() => import('./pages/Saved'));
const Applications = lazy(() => import('./pages/Applications'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const Profile = lazy(() => import('./pages/Profile'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminOpportunities = lazy(() => import('./pages/admin/AdminOpportunities'));
const AdminOpportunityForm = lazy(() => import('./pages/admin/AdminOpportunityForm'));
const AdminStudents = lazy(() => import('./pages/admin/AdminStudents'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminSources = lazy(() => import('./pages/admin/AdminSources'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

/* -------------------------------------------------------------------------- */
/* Guards                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Blocks a route unless the visitor is logged in with the required role.
 * Students who have not finished onboarding are sent there first.
 */
function ProtectedRoute({ role, children, requireOnboarding = true }) {
  const { isAuthenticated, user, loading, onboardingDone } = useAuth();
  const location = useLocation();

  // Wait until /auth/me has answered, otherwise we would redirect a logged-in
  // user to the login page on every hard refresh.
  if (loading) return <PageLoader label="Checking your session..." />;

  if (!isAuthenticated) {
    // Remember where they wanted to go so login can send them back.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  if (requireOnboarding && user.role === 'student' && !onboardingDone) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

/** Keeps a logged-in user away from the login / register screens. */
function GuestRoute({ children }) {
  const { isAuthenticated, user, loading, onboardingDone } = useAuth();

  if (loading) return <PageLoader />;

  if (isAuthenticated) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to={onboardingDone ? '/dashboard' : '/onboarding'} replace />;
  }

  return children;
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

export default function App() {
  return (
    <Suspense fallback={<PageLoader label="Loading page..." />}>
    <Routes>
      {/* ------------------------------------------------------- public */}
      <Route path="/" element={<Landing />} />
      <Route path="/opportunities/:id" element={<OpportunityDetails />} />

      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <Register />
          </GuestRoute>
        }
      />
      <Route
        path="/admin/login"
        element={
          <GuestRoute>
            <AdminLogin />
          </GuestRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <GuestRoute>
            <ForgotPassword />
          </GuestRoute>
        }
      />

      {/* Onboarding sits outside the student layout: it is a focused,
          full-screen wizard with no sidebar. */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute role="student" requireOnboarding={false}>
            <Onboarding />
          </ProtectedRoute>
        }
      />

      {/* ------------------------------------------------------ student */}
      <Route
        element={
          <ProtectedRoute role="student">
            <StudentLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/recommended" element={<Recommended />} />
        <Route path="/category/:slug" element={<CategoryPage />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* -------------------------------------------------------- admin */}
      <Route
        element={
          <ProtectedRoute role="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/opportunities" element={<AdminOpportunities />} />
        <Route path="/admin/opportunities/new" element={<AdminOpportunityForm />} />
        <Route path="/admin/opportunities/:id/edit" element={<AdminOpportunityForm />} />
        <Route path="/admin/students" element={<AdminStudents />} />
        <Route path="/admin/categories" element={<AdminCategories />} />
        <Route path="/admin/sources" element={<AdminSources />} />
        <Route path="/admin/analytics" element={<AdminAnalytics />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}
