/** Shown for any URL that does not match a route. */
import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function NotFound() {
  const { isAuthenticated, user } = useAuth();
  const home = !isAuthenticated ? '/' : user?.role === 'admin' ? '/admin' : '/dashboard';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-7xl font-bold text-primary-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-md text-slate-500">
        The page you are looking for does not exist or may have been moved.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to={home} className="btn-primary">
          <Home className="h-4 w-4" />
          Go home
        </Link>
        {isAuthenticated && (
          <Link to="/discover" className="btn-secondary">
            <Compass className="h-4 w-4" />
            Browse opportunities
          </Link>
        )}
      </div>
    </div>
  );
}
