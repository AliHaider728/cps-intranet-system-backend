import mongoose from 'mongoose';

const federationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  icb: { type: mongoose.Schema.Types.ObjectId, ref: 'ICB' },
  type: { type: String, enum: ['Federation', 'INT', 'Other'], default: 'Federation' },
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

const Federation = mongoose.model('Federation', federationSchema);
export default Federation;