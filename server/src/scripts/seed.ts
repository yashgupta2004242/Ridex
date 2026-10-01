import bcrypt from 'bcrypt';
import { connectMongo, disconnectMongo } from '../config/db';
import { getEnv, loadEnv } from '../config/env';
import { logger } from '../config/logger';
import { DriverProfileModel } from '../modules/driver/driver.model';
import { LedgerModel } from '../modules/payment/ledger.model';
import { PaymentModel } from '../modules/payment/payment.model';
import { DEFAULT_RATES } from '../modules/pricing/fare';
import { PricingConfigModel } from '../modules/pricing/pricing.model';
import { RideModel } from '../modules/ride/ride.model';
import { RatingModel } from '../modules/rating/rating.model';
import { SavedPlaceModel } from '../modules/user/savedPlace.model';
import { UserModel } from '../modules/user/user.model';

const PASSWORD = 'password1';

async function main(): Promise<void> {
  loadEnv();
  const env = getEnv();
  await connectMongo(env.MONGODB_URI);
  const passwordHash = await bcrypt.hash(PASSWORD, env.BCRYPT_ROUNDS);

  const demoEmails = ['rider@ridex.dev', 'driver@ridex.dev', 'admin@ridex.dev'];
  const demoPhones = ['+919100000001', '+919100000002', '+919100000003'];
  const existing = await UserModel.find({ $or: [{ email: { $in: demoEmails } }, { phone: { $in: demoPhones } }] });
  await DriverProfileModel.deleteMany({ userId: { $in: existing.map((row) => row._id) } });
  await RideModel.deleteMany({ rideCode: { $in: ['RXSEED1', 'RXSEED2'] } });
  await PaymentModel.deleteMany({ idempotencyKey: 'seed-pay' });
  await LedgerModel.deleteMany({ note: { $in: ['Seed earning', 'Seed earning previous month'] } });
  await RatingModel.deleteMany({ comment: 'Smooth ride, on time, and the car was clean.' });
  await SavedPlaceModel.deleteMany({ label: 'Cafe near the lake' });
  await UserModel.deleteMany({ _id: { $in: existing.map((row) => row._id) } });

  const rider = await UserModel.create({
    name: 'Demo Rider',
    email: 'rider@ridex.dev',
    phone: '+919100000001',
    passwordHash,
    role: 'rider',
    isEmailVerified: true,
    isPhoneVerified: true,
    status: 'active',
  });
  const driverUser = await UserModel.create({
    name: 'Demo Driver',
    email: 'driver@ridex.dev',
    phone: '+919100000002',
    passwordHash,
    role: 'driver',
    isEmailVerified: true,
    isPhoneVerified: true,
    status: 'active',
  });
  await UserModel.create({
    name: 'Demo Admin',
    email: 'admin@ridex.dev',
    phone: '+919100000003',
    passwordHash,
    role: 'admin',
    isEmailVerified: true,
    isPhoneVerified: true,
    status: 'active',
  });

  await DriverProfileModel.create({
    userId: driverUser._id,
    licenseNumber: 'DL-SEED-001',
    vehicle: { type: 'sedan', model: 'Dzire', plateNumber: 'DL01RX0001' },
    documents: [{ type: 'license', url: 'https://res.cloudinary.com/demo/license.jpg', status: 'approved' }],
    verificationStatus: 'approved',
    isOnline: true,
    currentLocation: { type: 'Point', coordinates: [77.2197, 28.6328] },
    rating: 4.8,
    totalTrips: 12,
    acceptanceRate: 0.9,
    offersSent: 20,
    offersAccepted: 18,
  });

  if (!(await PricingConfigModel.findOne({ key: 'default' }))) {
    await PricingConfigModel.create({ key: 'default', currency: 'INR', rates: DEFAULT_RATES });
  }

  await SavedPlaceModel.create({
    userId: rider._id,
    label: 'Cafe near the lake',
    address: 'Hauz Khas lake',
    location: { type: 'Point', coordinates: [77.2, 28.55] },
  });

  const completed = await RideModel.create({
    rideCode: 'RXSEED1',
    riderId: rider._id,
    driverId: driverUser._id,
    pickup: { address: 'Connaught Place', location: { type: 'Point', coordinates: [77.2197, 28.6328] } },
    drop: { address: 'IGI T3', location: { type: 'Point', coordinates: [77.1, 28.5562] } },
    vehicleType: 'sedan',
    status: 'COMPLETED',
    fare: { base: 60, distance: 80, time: 20, surge: 0, platformFee: 10, tax: 8, total: 178, surgeMultiplier: 1 },
    distanceMeters: 14000,
    durationSeconds: 1800,
    otpHash: '',
    path: [
      { lng: 77.2197, lat: 28.6328 },
      { lng: 77.21, lat: 28.62 },
      { lng: 77.185, lat: 28.598 },
      { lng: 77.15, lat: 28.575 },
      { lng: 77.12, lat: 28.562 },
      { lng: 77.1, lat: 28.5562 },
    ],
    route: [
      { lat: 28.6328, lng: 77.2197, at: new Date() },
      { lat: 28.598, lng: 77.185, at: new Date() },
      { lat: 28.5562, lng: 77.1, at: new Date() },
    ],
    timeline: [{ status: 'COMPLETED', at: new Date(), by: driverUser.id }],
    cancellation: { by: '', reason: '', fee: 0 },
    paymentId: null,
    summary: 'Connaught Place to IGI T3 in a sedan.',
    idempotencyKey: 'seed-completed',
  });

  const payment = await PaymentModel.create({
    rideId: completed._id,
    method: 'cash',
    amount: 178,
    status: 'captured',
    riderId: rider._id,
    driverId: driverUser._id,
    idempotencyKey: 'seed-pay',
  });
  completed.paymentId = payment.id;
  await completed.save();
  await LedgerModel.create({
    driverId: driverUser._id,
    rideId: completed._id,
    type: 'earning',
    amount: 160,
    note: 'Seed earning',
  });
  const lastMonth = new Date();
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  await LedgerModel.create({
    driverId: driverUser._id,
    rideId: completed._id,
    type: 'earning',
    amount: 95,
    note: 'Seed earning previous month',
    createdAt: lastMonth,
    updatedAt: lastMonth,
  });
  await RatingModel.create({
    rideId: completed._id,
    fromUserId: rider._id,
    score: 5,
    comment: 'Smooth ride, on time, and the car was clean.',
  });

  logger.info('Seeded demo users', {
    rider: 'rider@ridex.dev',
    driver: 'driver@ridex.dev',
    admin: 'admin@ridex.dev',
    password: PASSWORD,
  });
  await disconnectMongo();
}

void main().catch(async (error: unknown) => {
  logger.error('Seed failed', { error: error instanceof Error ? error.message : error });
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
