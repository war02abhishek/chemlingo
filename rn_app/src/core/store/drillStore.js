import { create } from 'zustand';
import { getDueDrills, submitAttempt } from '../api';

const useDrillStore = create((set, get) => ({
  drills: [],
  currentIndex: 0,
  isLoading: false,
  error: null,

  currentDrill: () => {
    const { drills, currentIndex } = get();
    return drills[currentIndex] ?? null;
  },
  isDone: () => {
    const { drills, currentIndex } = get();
    return currentIndex >= drills.length;
  },

  loadDrills: async () => {
    set({ isLoading: true, error: null });
    try {
      const drills = await getDueDrills();
      set({ drills, currentIndex: 0, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e.message });
    }
  },

  submitAnswer: async ({ isCorrect, timeTakenMs, answer }) => {
    const drill = get().currentDrill();
    const result = await submitAttempt({
      drillId: drill.id,
      isCorrect,
      timeTakenMs,
      answer,
    });
    set((s) => ({ currentIndex: s.currentIndex + 1 }));
    return result;
  },
}));

export default useDrillStore;
