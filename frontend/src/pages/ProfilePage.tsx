import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { LogOut, User, Mail, Shield, ChevronRight, Settings, Globe, Wifi, Cloud, Monitor, MonitorSmartphone, Download } from 'lucide-react';
import { HeaderWrapper } from '../components/common/HeaderWrapper';
import { MainWrapper } from '../components/common/MainWrapper';
import { getConnectionType, onConnectionTypeChange, type ConnectionType } from '../config/appConfig';
import { platformService } from '../services/platformService';
import { checkForUpdate, type UpdateInfo } from '../services/appUpdateService';
import { UpdateDialog } from '../components/common/UpdateDialog';
import { App } from '@capacitor/app';

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [connectionType, setConnectionType] = useState<ConnectionType>(getConnectionType());
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState(__APP_VERSION__);

  // Get actual installed version on native
  useEffect(() => {
    if (platformService.isNative) {
      App.getInfo().then(info => setAppVersion(info.version)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    return onConnectionTypeChange(setConnectionType);
  }, []);

  // Listen for startup update check result
  useEffect(() => {
    const handler = (e: Event) => {
      const info = (e as CustomEvent).detail as UpdateInfo;
      if (info?.hasUpdate) setUpdateInfo(info);
    };
    window.addEventListener('appUpdateAvailable', handler);
    return () => window.removeEventListener('appUpdateAvailable', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkForUpdate();
      if (info.hasUpdate) {
        setUpdateInfo(info);
      } else {
        // Brief toast-like feedback — already on latest
        alert(t('update.upToDate', { version: info.currentVersion }));
      }
    } catch {
      alert(t('update.checkFailed', 'Failed to check for updates'));
    } finally {
      setCheckingUpdate(false);
    }
  };

  // Get user initials for avatar
  const getInitials = () => {
    if (user?.display_name) {
      return user.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <HeaderWrapper>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white">{t('profile.title')}</h1>
        </div>
      </HeaderWrapper>
      {/* Main Content */}
      <MainWrapper className="pt-[85px]">
        {/* Profile Card */}
        <div className="bg-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold">
              {getInitials()}
            </div>

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-white truncate">
                {user?.display_name || t('profile.user')}
              </h2>
              <p className="text-sm text-gray-400 truncate flex items-center gap-1">
                <Mail className="w-4 h-4" />
                {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Account Info Section */}
        <div className="bg-gray-800 rounded-2xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              {t('profile.accountInfo')}
            </h3>
          </div>

          <div className="divide-y divide-gray-700">
            {/* Account Type */}
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center text-gray-400">
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-400">{t('profile.accountType')}</p>
                <p className="text-white capitalize">{user?.user_type || t('profile.standard')}</p>
              </div>
            </div>

            {/* Role */}
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center text-gray-400">
                <Shield className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-400">{t('profile.role')}</p>
                <p className="text-white capitalize">{user?.role || t('profile.user')}</p>
              </div>
            </div>

            {/* Admin Link (if admin) */}
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="px-4 py-4 flex items-center gap-3 hover:bg-gray-700/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400">
                  <Settings className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-white">{t('profile.adminDashboard')}</p>
                  <p className="text-sm text-gray-400">{t('profile.adminDashboardDesc')}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </Link>
            )}
          </div>
        </div>

        {/* Settings Section */}
        <div className="bg-gray-800 rounded-2xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              {t('profile.settings')}
            </h3>
          </div>

          <div className="divide-y divide-gray-700">
            {/* Language */}
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center text-gray-400">
                <Globe className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-400">{t('profile.language')}</p>
              </div>
              <div className="flex items-center bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    i18n.language === 'en'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => handleLanguageChange('zh')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    i18n.language === 'zh'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  中文
                </button>
              </div>
            </div>

            {/* Connection Type */}
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center text-gray-400">
                {connectionType === 'lan' ? (
                  <Wifi className="w-5 h-5 text-green-400" />
                ) : connectionType === 'tunnel' ? (
                  <Cloud className="w-5 h-5 text-blue-400" />
                ) : (
                  <Monitor className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-400">{t('profile.connection')}</p>
                <p className={`text-sm font-medium ${
                  connectionType === 'lan' ? 'text-green-400' :
                  connectionType === 'tunnel' ? 'text-blue-400' : 'text-gray-300'
                }`}>
                  {connectionType === 'lan'
                    ? t('profile.connectionLan')
                    : connectionType === 'tunnel'
                    ? t('profile.connectionTunnel')
                    : t('profile.connectionLocal')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Section */}
        <div className="bg-gray-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              {t('profile.actions', 'Actions')}
            </h3>
          </div>

          <button
            onClick={handleLogout}
            className="w-full px-4 py-4 flex items-center gap-3 hover:bg-gray-700/50 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center text-red-400">
              <LogOut className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-red-400 font-medium">{t('auth.signOut')}</p>
              <p className="text-sm text-gray-500">{t('auth.signOutDescription')}</p>
            </div>
          </button>
        </div>

        {/* Version & About */}
        <div className="bg-gray-800 rounded-2xl overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              {t('profile.about', 'About')}
            </h3>
          </div>

          <div className="divide-y divide-gray-700">
            {/* Version */}
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center text-gray-400">
                <MonitorSmartphone className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-400">{t('profile.version', 'Version')}</p>
                <p className="text-white text-sm font-mono">
                  v{appVersion}
                  <span className="text-gray-500 ml-2">
                    ({platformService.isAndroid ? 'Android' : platformService.isIOS ? 'iOS' : 'PWA'})
                  </span>
                </p>
              </div>
            </div>

            {/* Check for Updates (Android only) */}
            {platformService.isAndroid && (
              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="w-full px-4 py-4 flex items-center gap-3 hover:bg-gray-700/50 transition-colors text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400">
                  <Download className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-white">
                    {checkingUpdate
                      ? t('update.checking', 'Checking...')
                      : t('profile.checkUpdates', 'Check for Updates')}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Update Dialog */}
        {updateInfo && (
          <UpdateDialog
            updateInfo={updateInfo}
            onClose={() => setUpdateInfo(null)}
          />
        )}
      </MainWrapper>
    </div>
  );
}
