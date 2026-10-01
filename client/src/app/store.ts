import { configureStore } from '@reduxjs/toolkit';
import { api } from '../features/api';
import { sessionReducer } from '../features/auth/sessionSlice';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    session: sessionReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
