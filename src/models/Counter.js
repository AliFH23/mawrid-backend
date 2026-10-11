import mongoose from 'mongoose';

// one document per sequence (e.g. "SHP", "SUP"); `seq` is bumped atomically with $inc,
// so two accounts created at the same moment can never receive the same number
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export default mongoose.model('Counter', counterSchema);