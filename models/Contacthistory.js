import mongoose from 'mongoose';

const contactHistorySchema = new mongoose.Schema({
  ownerType: { type: String, enum: ['PCN', 'Practice'], required: true },
  ownerId:   { type: mongoose.Schema.Types.ObjectId, required: true },

  type: {
    type: String,
    enum: ['Email', 'Phone', 'Meeting', 'Document', 'Contract', 'Complaint', 'System Access', 'Other'],
    required: true,
  },
  direction: { type: String, enum: ['Inbound', 'Outbound'], default: 'Outbound' },
  subject:   { type: String, trim: true },
  summary:   { type: String },
  isStarred: { type: Boolean, default: false },

  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  attachments: [{ fileName: String, fileUrl: String }],
}, { timestamps: true });

contactHistorySchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });

const ContactHistory = mongoose.model('ContactHistory', contactHistorySchema);
export default ContactHistory;