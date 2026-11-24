import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

/**
 * Account identity and credentials. Deliberately small: everything a user can personalize
 * lives in the synchronized `profiles` and `userSettings` collections.
 */
const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: randomUUID },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    emailVerifiedAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { collection: 'users', timestamps: true, versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);

export function serializeUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
