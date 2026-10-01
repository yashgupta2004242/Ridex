import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { clearSession, setSession, type SessionUser } from './auth/sessionSlice';

type Envelope<T> = {
  success: boolean;
  data: T;
  error: { code: string; message: string } | null;
  requestId: string;
};

type AuthPayload = {
  accessToken: string;
  user: SessionUser;
};

export type DriverProfile = {
  userId: string;
  licenseNumber: string;
  vehicle: { type: 'bike' | 'auto' | 'sedan' | 'suv'; model: string; plateNumber: string };
  documents: { type: string; url: string; status: string }[];
  verificationStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason: string;
  isOnline: boolean;
  rating: number;
  totalTrips: number;
  acceptanceRate: number;
};

export type FareQuote = {
  vehicleType: 'bike' | 'auto' | 'sedan' | 'suv';
  base: number;
  distance: number;
  time: number;
  surge: number;
  platformFee: number;
  tax: number;
  total: number;
  surgeMultiplier: number;
};

export type PublicRide = {
  id: string;
  rideCode: string;
  riderId: string;
  driverId: string | null;
  pickup: { address: string; lat: number; lng: number };
  drop: { address: string; lat: number; lng: number };
  vehicleType: string;
  status: string;
  fare: { total: number; surgeMultiplier: number };
  otp: string | null;
  summary?: string;
  path?: { lat: number; lng: number }[];
  route?: { lat: number; lng: number }[];
};

export type EstimateResult = {
  distanceMeters: number;
  durationSeconds: number;
  geohash: string;
  quotes: FareQuote[];
  path: [number, number][];
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const state = getState() as { session: { accessToken: string | null } };
    if (state.session.accessToken) {
      headers.set('authorization', `Bearer ${state.session.accessToken}`);
    }
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  const isRefresh = typeof args !== 'string' && args.url === '/auth/refresh';
  if (result.error && result.error.status === 401 && !isRefresh) {
    const refresh = await rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions);
    if (refresh.data && typeof refresh.data === 'object' && 'data' in refresh.data) {
      const payload = (refresh.data as Envelope<AuthPayload>).data;
      api.dispatch(setSession(payload));
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      api.dispatch(clearSession());
    }
  }
  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['DriverMe'],
  endpoints: (build) => ({
    register: build.mutation<
      AuthPayload,
      { name: string; email: string; phone: string; password: string; role: 'rider' | 'driver' }
    >({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      transformResponse: (response: Envelope<AuthPayload>) => response.data,
    }),
    login: build.mutation<AuthPayload, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      transformResponse: (response: Envelope<AuthPayload>) => response.data,
    }),
    refresh: build.mutation<AuthPayload, void>({
      query: () => ({ url: '/auth/refresh', method: 'POST' }),
      transformResponse: (response: Envelope<AuthPayload>) => response.data,
    }),
    logout: build.mutation<{ loggedOut: boolean }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      transformResponse: (response: Envelope<{ loggedOut: boolean }>) => response.data,
    }),
    updateProfile: build.mutation<{ user: SessionUser }, { name?: string; phone?: string }>({
      query: (body) => ({ url: '/users/me', method: 'PATCH', body }),
      transformResponse: (response: Envelope<{ user: SessionUser }>) => response.data,
    }),
    uploadAvatar: build.mutation<{ user: SessionUser }, { dataUri: string }>({
      query: (body) => ({ url: '/users/me/avatar', method: 'POST', body }),
      transformResponse: (response: Envelope<{ user: SessionUser }>) => response.data,
    }),
    getDriverMe: build.query<{ driver: DriverProfile }, void>({
      query: () => ({ url: '/drivers/me' }),
      transformResponse: (response: Envelope<{ driver: DriverProfile }>) => response.data,
      providesTags: ['DriverMe'],
    }),
    onboardDriver: build.mutation<
      { driver: DriverProfile },
      {
        licenseNumber: string;
        vehicle: { type: 'bike' | 'auto' | 'sedan' | 'suv'; model: string; plateNumber: string };
      }
    >({
      query: (body) => ({ url: '/drivers/me/onboarding', method: 'PUT', body }),
      transformResponse: (response: Envelope<{ driver: DriverProfile }>) => response.data,
      invalidatesTags: ['DriverMe'],
    }),
    uploadDriverDocument: build.mutation<
      { driver: DriverProfile },
      { type: 'license' | 'registration' | 'insurance' | 'selfie'; dataUri: string }
    >({
      query: (body) => ({ url: '/drivers/me/documents', method: 'POST', body }),
      transformResponse: (response: Envelope<{ driver: DriverProfile }>) => response.data,
      invalidatesTags: ['DriverMe'],
    }),
    setDriverOnline: build.mutation<
      { driver: DriverProfile },
      { isOnline: boolean; lat?: number; lng?: number }
    >({
      query: (body) => ({ url: '/drivers/me/online', method: 'POST', body }),
      transformResponse: (response: Envelope<{ driver: DriverProfile }>) => response.data,
      invalidatesTags: ['DriverMe'],
    }),
    pendingDrivers: build.query<{ drivers: DriverProfile[] }, void>({
      query: () => ({ url: '/admin/drivers/pending' }),
      transformResponse: (response: Envelope<{ drivers: DriverProfile[] }>) => response.data,
    }),
    verifyDriver: build.mutation<
      { driver: DriverProfile },
      { userId: string; decision: 'approved' | 'rejected'; reason?: string }
    >({
      query: ({ userId, ...body }) => ({
        url: `/admin/drivers/${userId}/verify`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: Envelope<{ driver: DriverProfile }>) => response.data,
    }),
    estimateRide: build.mutation<
      EstimateResult,
      {
        pickup: { lat: number; lng: number; address?: string };
        drop: { lat: number; lng: number; address?: string };
      }
    >({
      query: (body) => ({ url: '/rides/estimate', method: 'POST', body }),
      transformResponse: (response: Envelope<EstimateResult>) => response.data,
    }),
    createRide: build.mutation<
      { ride: PublicRide },
      {
        pickup: { lat: number; lng: number; address?: string };
        drop: { lat: number; lng: number; address?: string };
        vehicleType: 'bike' | 'auto' | 'sedan' | 'suv';
        idempotencyKey: string;
      }
    >({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/rides',
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: (response: Envelope<{ ride: PublicRide }>) => response.data,
    }),
    getRide: build.query<{ ride: PublicRide }, string>({
      query: (id) => ({ url: `/rides/${id}` }),
      transformResponse: (response: Envelope<{ ride: PublicRide }>) => response.data,
    }),
    acceptRide: build.mutation<{ ride: PublicRide }, string>({
      query: (id) => ({ url: `/rides/${id}/accept`, method: 'POST' }),
      transformResponse: (response: Envelope<{ ride: PublicRide }>) => response.data,
    }),
    declineRide: build.mutation<{ declined: boolean }, string>({
      query: (id) => ({ url: `/rides/${id}/decline`, method: 'POST' }),
      transformResponse: (response: Envelope<{ declined: boolean }>) => response.data,
    }),
    arriveRide: build.mutation<{ ride: PublicRide }, string>({
      query: (id) => ({ url: `/rides/${id}/arrived`, method: 'POST' }),
      transformResponse: (response: Envelope<{ ride: PublicRide }>) => response.data,
    }),
    startRide: build.mutation<{ ride: PublicRide }, { id: string; otp: string }>({
      query: ({ id, otp }) => ({ url: `/rides/${id}/start`, method: 'POST', body: { otp } }),
      transformResponse: (response: Envelope<{ ride: PublicRide }>) => response.data,
    }),
    completeRide: build.mutation<{ ride: PublicRide }, string>({
      query: (id) => ({ url: `/rides/${id}/complete`, method: 'POST' }),
      transformResponse: (response: Envelope<{ ride: PublicRide }>) => response.data,
    }),
    cancelRide: build.mutation<{ ride: PublicRide }, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/rides/${id}/cancel`,
        method: 'POST',
        body: { reason },
      }),
      transformResponse: (response: Envelope<{ ride: PublicRide }>) => response.data,
    }),
    listRides: build.query<{ rides: PublicRide[] }, void>({
      query: () => ({ url: '/rides' }),
      transformResponse: (response: Envelope<{ rides: PublicRide[] }>) => response.data,
    }),
    payRide: build.mutation<
      { payment: { id: string; status: string; amount: number; method: string } },
      { rideId: string; method: 'cash' | 'upi' | 'card'; idempotencyKey: string }
    >({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/payments',
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      transformResponse: (response: Envelope<{ payment: { id: string; status: string; amount: number; method: string } }>) =>
        response.data,
    }),
    earnings: build.query<
      {
        balance: number;
        today: number;
        month: number;
        paidTrips: number;
        entries: {
          id: string;
          type: string;
          amount: number;
          note: string;
          rideId: string | null;
          at: string;
        }[];
        reviews: {
          id: string;
          rideId: string;
          rideCode: string;
          score: number;
          comment: string;
          at: string;
        }[];
        trips: {
          rideId: string;
          rideCode: string;
          pickup: { address: string; lat: number; lng: number };
          drop: { address: string; lat: number; lng: number };
          path: { lat: number; lng: number }[];
          fareTotal: number;
        }[];
      },
      void
    >({
      query: () => ({ url: '/drivers/me/earnings' }),
      transformResponse: (
        response: Envelope<{
          balance: number;
          today: number;
          month: number;
          paidTrips: number;
          entries: {
            id: string;
            type: string;
            amount: number;
            note: string;
            rideId: string | null;
            at: string;
          }[];
          reviews: {
            id: string;
            rideId: string;
            rideCode: string;
            score: number;
            comment: string;
            at: string;
          }[];
          trips: {
            rideId: string;
            rideCode: string;
            pickup: { address: string; lat: number; lng: number };
            drop: { address: string; lat: number; lng: number };
            path: { lat: number; lng: number }[];
            fareTotal: number;
          }[];
        }>,
      ) => response.data,
    }),
    chatSupport: build.mutation<
      { reply: string; pending?: { tool: string; args: Record<string, unknown> } },
      { messages: { role: 'user' | 'assistant'; content: string }[] }
    >({
      query: (body) => ({ url: '/ai/chat', method: 'POST', body }),
      transformResponse: (
        response: Envelope<{ reply: string; pending?: { tool: string; args: Record<string, unknown> } }>,
      ) => response.data,
    }),
    sos: build.mutation<{ opened: boolean }, { rideId: string; message: string }>({
      query: (body) => ({ url: '/ai/sos', method: 'POST', body }),
      transformResponse: (response: Envelope<{ opened: boolean }>) => response.data,
    }),
    listPlaces: build.query<{ places: { id: string; label: string; lat: number; lng: number }[] }, void>({
      query: () => ({ url: '/places' }),
      transformResponse: (response: Envelope<{ places: { id: string; label: string; lat: number; lng: number }[] }>) =>
        response.data,
    }),
    searchPlace: build.mutation<
      { place: { label: string; lat: number; lng: number; confidence: number } },
      { query: string }
    >({
      query: (body) => ({ url: '/ai/search', method: 'POST', body }),
      transformResponse: (
        response: Envelope<{ place: { label: string; lat: number; lng: number; confidence: number } }>,
      ) => response.data,
    }),
    rateRide: build.mutation<{ rated: boolean }, { id: string; score: number; comment: string }>({
      query: ({ id, score, comment }) => ({ url: `/rides/${id}/rate`, method: 'POST', body: { score, comment } }),
      transformResponse: (response: Envelope<{ rated: boolean }>) => response.data,
    }),
    confirmSupport: build.mutation<{ reply: string }, { tool: string; args: Record<string, unknown> }>({
      query: (body) => ({ url: '/ai/confirm', method: 'POST', body }),
      transformResponse: (response: Envelope<{ reply: string }>) => response.data,
    }),
    adminStats: build.query<{ revenue: number; count: number }, void>({
      query: () => ({ url: '/admin/stats' }),
      transformResponse: (response: Envelope<{ revenue: number; count: number }>) => response.data,
    }),
    geocode: build.query<{ places: { label: string; lat: number; lng: number }[] }, string>({
      query: (q) => ({ url: `/geo/search?q=${encodeURIComponent(q)}` }),
      transformResponse: (response: Envelope<{ places: { label: string; lat: number; lng: number }[] }>) =>
        response.data,
    }),
    reverseGeocode: build.query<
      { place: { label: string; lat: number; lng: number } },
      { lat: number; lng: number }
    >({
      query: ({ lat, lng }) => ({ url: `/geo/reverse?lat=${lat}&lng=${lng}` }),
      transformResponse: (response: Envelope<{ place: { label: string; lat: number; lng: number } }>) => response.data,
    }),
    liveRides: build.query<{ rides: PublicRide[] }, void>({
      query: () => ({ url: '/admin/rides/live' }),
      transformResponse: (response: Envelope<{ rides: PublicRide[] }>) => response.data,
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  useGetDriverMeQuery,
  useOnboardDriverMutation,
  useUploadDriverDocumentMutation,
  useSetDriverOnlineMutation,
  usePendingDriversQuery,
  useVerifyDriverMutation,
  useEstimateRideMutation,
  useCreateRideMutation,
  useGetRideQuery,
  useAcceptRideMutation,
  useDeclineRideMutation,
  useArriveRideMutation,
  useStartRideMutation,
  useCompleteRideMutation,
  useCancelRideMutation,
  useListRidesQuery,
  usePayRideMutation,
  useEarningsQuery,
  useChatSupportMutation,
  useSosMutation,
  useListPlacesQuery,
  useSearchPlaceMutation,
  useRateRideMutation,
  useConfirmSupportMutation,
  useAdminStatsQuery,
  useLiveRidesQuery,
  useLazyGeocodeQuery,
  useLazyReverseGeocodeQuery,
} = api;
