import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Clock, User } from 'lucide-react';

export default function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();

  const navItems = [
    {
      path: '/history',
      icon: <Clock className="w-6 h-6" />,
      labelKey: 'nav.history',
    },
    {
      path: '/',
      icon: <Home className="w-6 h-6" />,
      labelKey: 'nav.library',
    },
    {
      path: '/profile',
      icon: <User className="w-6 h-6" />,
      labelKey: 'nav.profile',
    },
  ];

  // Don't show on admin pages, login, register, or player pages
  const hiddenPaths = ['/admin', '/login', '/register', '/player'];
  const shouldHide = hiddenPaths.some(path => location.pathname.startsWith(path));

  if (shouldHide) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 z-50">
      <div className="max-w-md mx-auto px-4">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-150
                  ${isActive
                    ? 'text-indigo-400'
                    : 'text-gray-400 hover:text-gray-200 active:scale-95'
                  }`}
              >
                <div className={`relative ${isActive ? 'transform scale-110' : ''}`}>
                  {item.icon}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-indigo-400 rounded-full" />
                  )}
                </div>
                <span className="text-xs font-medium">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Safe area padding for iOS */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
