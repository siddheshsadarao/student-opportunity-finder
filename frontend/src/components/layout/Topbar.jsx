/**
 * The top bar: mobile menu button, global search, notification bell and the
 * profile dropdown.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, LogOut, User, Settings, ChevronDown, Check, Trash2, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { notificationApi } from '../../services/api';
import { Avatar, useClickOutside } from '../ui';
import { timeAgo } from '../../utils/format';
import { useTheme } from '../../context/ThemeContext';

const NOTIFICATION_TONES = {
  deadline: 'bg-red-100 text-red-600',
  match: 'bg-primary-100 text-primary-600',
  system: 'bg-slate-100 text-slate-600',
  info: 'bg-blue-100 text-blue-600',
};

export default function Topbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();

  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const notificationRef = useClickOutside(useCallback(() => setShowNotifications(false), []));
  const profileRef = useClickOutside(useCallback(() => setShowProfile(false), []));

  /** Loads notifications once when the bar mounts. */
  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationApi.list();
      setNotifications(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      // A failed notification fetch should never break the page.
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onSearchSubmit = (event) => {
    event.preventDefault();
    const term = search.trim();
    navigate(term ? `/discover?search=${encodeURIComponent(term)}` : '/discover');
    setSearch('');
  };

  const markAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnread(0);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const openNotification = async (notification) => {
    setShowNotifications(false);
    if (!notification.isRead) {
      try {
        await notificationApi.markRead(notification.id);
        setUnread((current) => Math.max(0, current - 1));
        setNotifications((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item))
        );
      } catch {
        // Not critical -- still navigate.
      }
    }
    if (notification.opportunityId) navigate(`/opportunities/${notification.opportunityId}`);
  };

  const removeNotification = async (event, id) => {
    event.stopPropagation();
    try {
      await notificationApi.remove(id);
      setNotifications((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const onLogout = () => {
    logout();
    toast.success('You have been logged out.');
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* ------------------------------------------------------- search */}
      <form onSubmit={onSearchSubmit} className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search internships, scholarships, hackathons..."
          className="input h-10 pl-9"
          aria-label="Search opportunities"
        />
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
          aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        {/* -------------------------------------------------- notifications */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => setShowNotifications((current) => !current)}
            className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-fade-in sm:w-96">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-500">
                    No notifications yet.
                  </p>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={`group flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                        notification.isRead ? '' : 'bg-primary-50/40'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          NOTIFICATION_TONES[notification.type] || NOTIFICATION_TONES.info
                        }`}
                      >
                        <Bell className="h-4 w-4" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">
                          {notification.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          {notification.message}
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </span>

                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => removeNotification(event, notification.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') removeNotification(event, notification.id);
                        }}
                        className="shrink-0 self-start rounded p-1 text-slate-300 opacity-0 transition hover:bg-slate-200 hover:text-slate-600 group-hover:opacity-100"
                        aria-label="Delete notification"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------- profile */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setShowProfile((current) => !current)}
            className="flex items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-slate-100"
            aria-label="Account menu"
          >
            <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
            <span className="hidden text-sm font-medium text-slate-700 sm:block">
              {user?.name?.split(' ')[0]}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>

          {showProfile && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl animate-fade-in">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>

              <Link
                to="/profile"
                onClick={() => setShowProfile(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <User className="h-4 w-4 text-slate-400" />
                My Profile
              </Link>
              <Link
                to="/settings"
                onClick={() => setShowProfile(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <Settings className="h-4 w-4 text-slate-400" />
                Settings
              </Link>

              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
