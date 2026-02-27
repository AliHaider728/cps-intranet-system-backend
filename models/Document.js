import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['Contract', 'SOP', 'NDA', 'MOU', 'Mobilisation Plan', 'Confidentiality',
           'DPA', 'Prescribing Policy', 'Welcome Pack', 'Monthly Report', 'Other'],
    required: true,
  },
  fileUrl:   { type: String, trim: true },
  fileSize:  { type: Number },
  mimeType:  { type: String, trim: true },

  // Who it belongs to
  ownerType: { type: String, enum: ['PCN', 'Practice', 'Clinician', 'Global'], required: true },
  ownerId:   { type: mongoose.Schema.Types.ObjectId, required: true },

  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isArchived: { type: Boolean, default: false },
  notes:      { type: String },
}, { timestamps: true });

const Document = mongoose.model('Document', documentSchema);
export default Document;