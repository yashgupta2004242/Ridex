import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'rider' | 'driver' | 'admin';
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  avatarUrl: string | null;
  status: string;
};

type SessionState = {
  accessToken: string | null;
  user: SessionUser | null;
};

const initialState: SessionState = {
  accessToken: null,
  user: null,
};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setSession(
      state,
      action: PayloadAction<{ accessToken: string; user: SessionUser }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
    },
    clearSession(state) {
      state.accessToken = null;
      state.user = null;
    },
  },
});

export const { setSession, clearSession } = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
