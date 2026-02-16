import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Clock, User, WifiOff, Download } from 'lucide-react';
import { useNetworkStore } from '../../stores/networkStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { downloadService } from '../../services/downloadService';

export default function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const { isOnline } = useNetworkStore();
  const { activeTasks } = useDownloadStore();

  // Don't show on admin pages, login, register, or player pages
  const hiddenPaths = ['/admin', '/login', '/register', '/player'];
  const shouldHide = hiddenPaths.some(path => location.pathname.startsWith(path));

  // Measure actual height and expose as CSS variable for MiniPlayer positioning.
  // Re-runs when shouldHide changes so the observer is set up after the nav appears.
  useEffect(() => {
    if (shouldHide) {
      document.documentElement.style.setProperty('--bottom-nav-height', '0px');
      return;
    }
    const el = navRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty('--bottom-nav-height', `${el.offsetHeight}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty('--bottom-nav-height', '0px');
    };
  }, [shouldHide]);

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
    ...(downloadService.isSupported ? [{
      path: '/downloads',
      icon: <Download className="w-6 h-6" />,
      labelKey: 'nav.downloads',
      badge: activeTasks.length || undefined,
    }] : []),
    {
      path: '/profile',
      icon: <User className="w-6 h-6" />,
      labelKey: 'nav.profile',
    },
  ];

  if (shouldHide) {
    return null;
  }

  return (
    <nav ref={navRef} className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 z-50 pb-[env(safe-area-inset-bottom)]">
      {!isOnline && (
        <div className="flex items-center justify-center gap-1.5 py-1 bg-amber-900/80 text-amber-200 text-xs">
          <WifiOff className="w-3 h-3" />
          <span>Offline</span>
        </div>
      )}
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
                  {'badge' in item && (item as any).badge && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center px-1">
                      {(item as any).badge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
