import mongoose from 'mongoose';

const icbSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  icbCode: { type: String, trim: true },
  region: { type: String, trim: true },
  contactName: { type: String, trim: true },
  contactEmail: { type: String, trim: true, lowercase: true },
  contactPhone: { type: String, trim: true },
  address: {
    street: String,
    city: String,
    postCode: String,
  },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const ICB = mongoose.model('ICB', icbSchema);
export default ICB;