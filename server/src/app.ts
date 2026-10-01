import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Server as HttpServer } from 'node:http';
import { DRIVERS_GEO_KEY, OFFER_TIMEOUT_MS } from './common/constants';
import { pingMongo } from './config/db';
import { createLazyRedisCache, type CacheStore } from './config/cache';
import { getEnv, type Env } from './config/env';
import { createLazyRedisLock, MemoryLock, type LockStore } from './config/lock';
import { logger } from './config/logger';
import { getRedis, pingRedis, redisStatus } from './config/redis';
import { CloudinaryStorage, MemoryStorage, type StoragePort } from './config/storage';
import { BullJobQueue, createBullQueues, createBullRedis } from './jobs/bull';
import { InlineJobQueue, type JobQueue } from './jobs/queue';
import { cookies } from './middleware/cookies';
import { errorHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { sanitizeMongo } from './middleware/sanitizeMongo';
import { AdminController, createAdminRouter } from './modules/admin/admin.controller';
import { AdminService } from './modules/admin/admin.service';
import { AuditLogRepository } from './modules/admin/auditLog.repository';
import { AuthController } from './modules/auth/auth.controller';
import { createAuthRouter } from './modules/auth/auth.routes';
import { AuthService, type MailerPort } from './modules/auth/auth.service';
import { GoogleOAuthClient, type GoogleOAuthPort } from './modules/auth/googleOAuth';
import { RefreshTokenRepository } from './modules/auth/refreshToken.repository';
import { DriverController, createDriverRouter } from './modules/driver/driver.controller';
import { DriverRepository } from './modules/driver/driver.repository';
import { DriverService } from './modules/driver/driver.service';
import { HealthController } from './modules/health/health.controller';
import { createHealthRouter } from './modules/health/health.routes';
import { HealthService, type ReadinessChecks } from './modules/health/health.service';
import { UserController, createUserRouter } from './modules/user/user.controller';
import { UserRepository } from './modules/user/user.repository';
import { UserService } from './modules/user/user.service';
import { createUploadRouter } from './modules/user/upload.routes';
import { PricingController, createPricingRouter } from './modules/pricing/pricing.controller';
import { PricingRepository } from './modules/pricing/pricing.repository';
import { PricingService } from './modules/pricing/pricing.service';
import { OsrmClient, type RoutingPort } from './modules/pricing/routing';
import type { Clock } from './modules/matching/clock';
import { realClock } from './modules/matching/clock';
import { MatchingService, type MatchingHooks } from './modules/matching/matching.service';
import { OfferBroker } from './modules/matching/offerBroker';
import { RatingRepository } from './modules/rating/rating.repository';
import { RideController, createRideRouter } from './modules/ride/ride.controller';
import { RideRepository } from './modules/ride/ride.repository';
import { RideService } from './modules/ride/ride.service';
import { MemoryRazorpay, RazorpayGateway, type RazorpayPort } from './config/razorpay';
import { PaymentController, createPaymentRouter } from './modules/payment/payment.controller';
import { PaymentRepository } from './modules/payment/payment.repository';
import { PaymentService } from './modules/payment/payment.service';
import { AiController, createAiRouter } from './modules/ai/ai.controller';
import { AiService } from './modules/ai/ai.service';
import { FallbackLlm, OpenAiLlm, type LlmPort } from './modules/ai/llm';
import { summarizeRide } from './jobs/summaries';
import { SavedPlaceRepository } from './modules/user/savedPlace.repository';
import { MemoryGeo, RedisGeo, type GeoIndex } from './realtime/geo';
import { RealtimeHub } from './realtime/hub';
import { LocationService } from './realtime/locationService';
import { attachRealtime, type RealtimeHandle } from './realtime/socket';

export type RidexRuntime = {
  hub: RealtimeHub;
  locations: LocationService;
  matching: MatchingService;
  rides: RideService;
  attachRealtime: (httpServer: HttpServer) => Promise<RealtimeHandle>;
};

export type CreateAppOptions = {
  env?: Env;
  readiness?: ReadinessChecks;
  cache?: CacheStore;
  mailer?: MailerPort;
  googleOAuth?: GoogleOAuthPort;
  otpGenerator?: () => string;
  storage?: StoragePort;
  routing?: RoutingPort;
  geo?: GeoIndex;
  locks?: LockStore;
  jobs?: JobQueue;
  matchingHooks?: MatchingHooks;
  offerTimeoutMs?: number;
  clock?: Clock;
  razorpay?: RazorpayPort;
  llm?: LlmPort;
};

const defaultMailer: MailerPort = {
  async sendEmailVerification(email: string, _token: string) {
    logger.info('Email verification issued', { email });
  },
  async sendPasswordReset(email: string, _token: string) {
    logger.info('Password reset issued', { email });
  },
};

export function createApp(options: CreateAppOptions = {}): Express {
  const env = options.env ?? getEnv();
  const checks = options.readiness ?? {
    checkMongo: pingMongo,
    checkRedis: pingRedis,
  };
  const cache = options.cache ?? createLazyRedisCache(() => getRedis());
  const google = options.googleOAuth ?? new GoogleOAuthClient(env);
  const storage =
    options.storage ??
    (env.NODE_ENV === 'test' || !env.CLOUDINARY_CLOUD_NAME
      ? new MemoryStorage()
      : new CloudinaryStorage(env));

  const userRepository = new UserRepository();
  const userService = new UserService(userRepository, storage);
  const authService = new AuthService(
    env,
    userRepository,
    userService,
    new RefreshTokenRepository(),
    cache,
    options.mailer ?? defaultMailer,
    google,
    options.otpGenerator,
  );
  const routing = options.routing ?? new OsrmClient(env);
  const pricingService = new PricingService(cache, routing, new PricingRepository());
  const geo =
    options.geo ??
    (redisStatus.connected ? new RedisGeo(() => getRedis(), DRIVERS_GEO_KEY) : new MemoryGeo());
  const hub = new RealtimeHub();
  const driverService = new DriverService(
    new DriverRepository(),
    userService,
    storage,
    (userId) => geo.remove(userId),
    (userId, lng, lat) => geo.add(userId, { lng, lat }),
  );
  const rideRepository = new RideRepository();
  const broker = new OfferBroker();
  const matching = new MatchingService(
    rideRepository,
    driverService,
    geo,
    hub,
    broker,
    options.offerTimeoutMs ?? OFFER_TIMEOUT_MS,
    options.clock ?? realClock,
    options.matchingHooks,
  );
  const llm =
    options.llm ??
    (env.OPENAI_API_KEY ? new OpenAiLlm(env.OPENAI_API_KEY, env.OPENAI_MODEL) : new FallbackLlm());
  const jobs =
    options.jobs ??
    (redisStatus.connected && env.NODE_ENV === 'production'
      ? (() => {
          const connection = createBullRedis(env.REDIS_URL);
          const queues = createBullQueues(connection);
          return new BullJobQueue(queues.matching, queues.receipts);
        })()
      : new InlineJobQueue(
          (rideId) => matching.run(rideId),
          (rideId) => summarizeRide(rideId, llm),
        ));
  const locks =
    options.locks ??
    (redisStatus.connected ? createLazyRedisLock(() => getRedis()) : new MemoryLock());
  const rideService = new RideService(
    rideRepository,
    userService,
    driverService,
    pricingService,
    hub,
    locks,
    cache,
    jobs,
    broker,
    new RatingRepository(),
  );
  const locations = new LocationService(geo, driverService, rideService);
  const razorpay =
    options.razorpay ??
    (env.NODE_ENV === 'test' ? new MemoryRazorpay() : new RazorpayGateway(env));
  const paymentService = new PaymentService(
    new PaymentRepository(),
    rideRepository,
    razorpay,
    env.RAZORPAY_KEY_ID,
  );
  const places = new SavedPlaceRepository();
  const aiService = new AiService(
    llm,
    rideService,
    paymentService,
    places,
    rideRepository,
  );
  const adminService = new AdminService(
    userService,
    driverService,
    authService,
    new AuditLogRepository(),
  );

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '2mb',
        verify: (req, _res, buf) => {
          Object.assign(req, { rawBody: buf.toString('utf8') });
        },
    }),
  );
  app.use(cookies);
  app.use(sanitizeMongo);

  const healthService = new HealthService(checks);
  const healthController = new HealthController(healthService);
  app.use(createHealthRouter(healthController));

  const authController = new AuthController(authService, userService, env);
  app.use(createAuthRouter(authController, authService, cache));
  app.use(createUserRouter(new UserController(userService), authService));
  app.use(createUploadRouter(storage, authService));
  app.use(createDriverRouter(new DriverController(driverService), authService));
  app.use(createAdminRouter(new AdminController(adminService), authService));
  app.use(createPricingRouter(new PricingController(pricingService), authService));
  app.use(createRideRouter(new RideController(rideService), authService, cache));
  app.use(createPaymentRouter(new PaymentController(paymentService), authService, cache));
  app.use(createAiRouter(new AiController(aiService, places), authService));

  const ridex: RidexRuntime = {
    hub,
    locations,
    matching,
    rides: rideService,
    attachRealtime: (httpServer) =>
      attachRealtime(httpServer, {
        env,
        auth: authService,
        locations,
        rideSync: rideService,
        hub,
      }),
  };
  app.locals.ridex = ridex;

  app.use(errorHandler);
  return app;
}

export function getRidex(app: Express): RidexRuntime {
  const runtime = app.locals.ridex as RidexRuntime | undefined;
  if (!runtime) {
    throw new Error('RideX realtime runtime is missing from the Express app');
  }
  return runtime;
}
