const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    issueDetails: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
        default: 'OPEN'
    },
    reassignmentCount: {
        type: Number,
        default: 0,
        min: 0,
        max: 1 
    },
    reassignmentHistory: [{
        fromAgent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        toAgent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Ticket', ticketSchema);