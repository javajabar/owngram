import { create } from 'zustand'

interface CallState {
  incomingCall: {
    chatId: string | null
    fromUserId: string | null
  } | null
  setIncomingCall: (chatId: string, fromUserId: string) => void
  clearIncomingCall: () => void
}

export const useCallStore = create<CallState>((set) => ({
  incomingCall: null,
  setIncomingCall: (chatId, fromUserId) => set({ 
    incomingCall: { chatId, fromUserId } 
  }),
  clearIncomingCall: () => set({ incomingCall: null }),
}))

