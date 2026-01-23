import { TimerIcon, CloseIcon } from '../common/icons';
import { formatRemainingTime } from '../../utils/formatters';

interface SleepTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTimer: number | null;
  remainingTime: number;
  onSetTimer: (minutes: number) => void;
  onCancelTimer: () => void;
}

const TIMER_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

export function SleepTimerModal({
  isOpen,
  onClose,
  activeTimer,
  remainingTime,
  onSetTimer,
  onCancelTimer,
}: SleepTimerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <TimerIcon />
            Sleep Timer
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Active timer display */}
        {activeTimer !== null && (
          <div className="mb-6 p-4 bg-indigo-600/20 border border-indigo-500/30 rounded-xl">
            <p className="text-indigo-300 text-sm mb-1">Timer active</p>
            <p className="text-3xl font-bold text-white">{formatRemainingTime(remainingTime)}</p>
            <button
              onClick={() => {
                onCancelTimer();
                onClose();
              }}
              className="mt-3 w-full py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
            >
              Cancel Timer
            </button>
          </div>
        )}

        {/* Timer options */}
        <div className="grid grid-cols-3 gap-3">
          {TIMER_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              onClick={() => {
                onSetTimer(minutes);
                onClose();
              }}
              className={`py-4 rounded-xl text-center transition-all ${
                activeTimer === minutes
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span className="text-lg font-semibold">{minutes}</span>
              <span className="text-xs block text-gray-400">min</span>
            </button>
          ))}
        </div>

        {/* Off button */}
        <button
          onClick={() => {
            onCancelTimer();
            onClose();
          }}
          className="w-full mt-4 py-3 rounded-xl bg-gray-700/50 text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Turn Off
        </button>
      </div>
    </div>
  );
}
