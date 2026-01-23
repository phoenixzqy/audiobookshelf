import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { LogOut, User, Mail, Shield, ChevronRight, Settings } from 'lucide-react';
import { HeaderWrapper } from '../components/common/HeaderWrapper';
import { MainWrapper } from '../components/common/MainWrapper';

export default function ProfilePage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
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
          <h1 className="text-2xl font-bold text-white">Profile</h1>
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
                {user?.display_name || 'User'}
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
              Account Info
            </h3>
          </div>

          <div className="divide-y divide-gray-700">
            {/* Account Type */}
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center text-gray-400">
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-400">Account Type</p>
                <p className="text-white capitalize">{user?.user_type || 'Standard'}</p>
              </div>
            </div>

            {/* Role */}
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center text-gray-400">
                <Shield className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-400">Role</p>
                <p className="text-white capitalize">{user?.role || 'User'}</p>
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
                  <p className="text-white">Admin Dashboard</p>
                  <p className="text-sm text-gray-400">Manage books and users</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </Link>
            )}
          </div>
        </div>

        {/* Actions Section */}
        <div className="bg-gray-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Actions
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
              <p className="text-red-400 font-medium">Sign Out</p>
              <p className="text-sm text-gray-500">Sign out of your account</p>
            </div>
          </button>
        </div>

        {/* Version Info */}
        <p className="text-center text-xs text-gray-600 mt-8">
          Audiobooks v1.0.0
        </p>
      </MainWrapper>
    </div>
  );
}
