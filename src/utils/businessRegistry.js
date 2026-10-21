import mongoose from 'mongoose';
import BlockedBusiness from '../models/BlockedBusiness.js';

// Shop and Supplier are looked up through mongoose.models (not imported) because both of
// those models import this file — importing them back here would be a circular import.

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

// "١٢٣-٤٥ 6" and "123456" must count as the same number, otherwise typing a separator or
// Arabic digits would be a free way around the uniqueness rule
export const normalizeRegNumber = (value) => {
  if (value === undefined || value === null) return value;
  return String(value)
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_INDIC.indexOf(d)))
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase();
};

export const isValidRegNumber = (normalized) =>
  typeof normalized === 'string' && normalized.length >= MIN_LENGTH && normalized.length <= MAX_LENGTH;

export const MESSAGES = {
  INVALID: 'الرقم التجاري غير صالح (3 إلى 20 خانة، أرقام أو حروف)',
  TAKEN: 'هذا الرقم التجاري مسجّل بحساب آخر. إذا كان رقمك فعلًا، سجّل الدخول بحسابك الأصلي أو تواصل مع الدعم.',
  BLOCKED: 'هذا الرقم التجاري ممنوع من التسجيل في المنصة. تواصل مع الدعم.',
  MINE: 'هذا الرقم التجاري مرتبط بحسابك',
  AVAILABLE: 'الرقم التجاري متاح',
};

// → { status: 'AVAILABLE' | 'MINE' | 'TAKEN' | 'BLOCKED' | 'INVALID', normalized }
//   MINE = it already belongs to `excludeUserId` (the person asking)
// An account that was deactivated still holds its number: banning someone must not free
// the number for a brand-new account.
export const getRegistrationStatus = async (rawNumber, { excludeUserId } = {}) => {
  const normalized = normalizeRegNumber(rawNumber);
  if (!isValidRegNumber(normalized)) return { status: 'INVALID', normalized };

  if (await BlockedBusiness.exists({ number: normalized })) return { status: 'BLOCKED', normalized };

  const [shop, supplier] = await Promise.all([
    mongoose.models.Shop?.findOne({ commercialRegistrationNumber: normalized }).select('userId'),
    mongoose.models.Supplier?.findOne({ commercialRegistrationNumber: normalized }).select('userId'),
  ]);
  const owner = shop || supplier;

  if (owner) {
    const isMine = excludeUserId && String(owner.userId) === String(excludeUserId);
    return { status: isMine ? 'MINE' : 'TAKEN', normalized };
  }
  return { status: 'AVAILABLE', normalized };
};

// throws a 400-style ValidationError when the number can't be used by this user
export const assertRegNumberUsable = async (rawNumber, excludeUserId) => {
  const { status } = await getRegistrationStatus(rawNumber, { excludeUserId });
  if (status === 'AVAILABLE' || status === 'MINE') return;
  const error = new Error(MESSAGES[status]);
  // controllers already turn ValidationError into a 400 with error.message
  error.name = 'ValidationError';
  throw error;
};

// Backstop on the models themselves, so no controller can forget the rule:
//  - creating a profile, or saving one whose number changed → pre('validate')
//  - editing through findOneAndUpdate / updateOne → query middleware
export const attachRegNumberGuards = (schema) => {
  schema.pre('validate', async function () {
    if (!this.isNew && !this.isModified('commercialRegistrationNumber')) return;
    await assertRegNumberUsable(this.commercialRegistrationNumber, this.userId);
  });

  const guardQueryUpdate = async function () {
    const update = this.getUpdate() || {};
    const target = update.$set && 'commercialRegistrationNumber' in update.$set ? update.$set : update;
    if (!('commercialRegistrationNumber' in target)) return;

    // the owner is needed so editing your own profile with your own number isn't "taken"
    const current = await this.model.findOne(this.getFilter()).select('userId');
    await assertRegNumberUsable(target.commercialRegistrationNumber, current?.userId);
    target.commercialRegistrationNumber = normalizeRegNumber(target.commercialRegistrationNumber);
  };

  schema.pre('findOneAndUpdate', guardQueryUpdate);
  schema.pre('updateOne', guardQueryUpdate);
};