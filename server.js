require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { auth, requireRole } = require('./middleware/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => console.log('❌ MongoDB Connection Error:', err));

// Import Models
const User = require('./models/User');
const Ticket = require('./models/Ticket');



// 1. REGISTER USER
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role, age } = req.body;
        
        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Name, email and password are required' 
            });
        }
        
        // Validate role
        if (role && !['CUSTOMER', 'AGENT'].includes(role)) {
            return res.status(400).json({ 
                success: false,
                error: 'Role must be CUSTOMER or AGENT' 
            });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                error: 'User already exists with this email' 
            });
        }
        
        // Create user
        const user = new User({
            name,
            email,
            password,
            role: role || 'CUSTOMER',
            age
        });
        
        await user.save();
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id, 
                email: user.email, 
                role: user.role, 
                name: user.name 
            },
            process.env.JWT_SECRET || process.env.SECRET_CODE,
            { expiresIn: '24h' }
        );
        
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error during registration' 
        });
    }
});

// 2. LOGIN USER
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email and password are required' 
            });
        }
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid email or password' 
            });
        }
        
        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid email or password' 
            });
        }
        
        // Generate JWT token
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { 
                userId: user._id, 
                email: user.email, 
                role: user.role, 
                name: user.name 
            },
            process.env.JWT_SECRET || process.env.SECRET_CODE,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error during login' 
        });
    }
});

// 3. GET CURRENT USER
app.get('/api/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }
        res.json({
            success: true,
            user
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Server error' 
        });
    }
});

// 4. CREATE TICKET (CUSTOMER ONLY)
app.post('/api/tickets', auth, requireRole('CUSTOMER'), async (req, res) => {
    try {
        const { issueDetails } = req.body;
        
        // Validation
        if (!issueDetails || issueDetails.trim().length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Issue details are required' 
            });
        }
        
        // Find available agents
        const agents = await User.find({ role: 'AGENT' });
        if (agents.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'No agents available. Please contact administrator.' 
            });
        }
        
        // Assign to first available agent (or random)
        const assignedAgent = agents[0];
        
        // Create ticket
        const ticket = new Ticket({
            customer: req.user.userId,
            assignedAgent: assignedAgent._id,
            issueDetails: issueDetails.trim()
        });
        
        await ticket.save();
        
        // Populate data for response
        await ticket.populate('customer', 'name email');
        await ticket.populate('assignedAgent', 'name email');
        
        res.status(201).json({
            success: true,
            message: 'Ticket created successfully',
            ticket
        });
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error creating ticket' 
        });
    }
});

// 5. GET CUSTOMER'S TICKETS
app.get('/api/tickets/my-tickets', auth, requireRole('CUSTOMER'), async (req, res) => {
    try {
        const tickets = await Ticket.find({ customer: req.user.userId })
            .populate('assignedAgent', 'name email')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            count: tickets.length,
            tickets
        });
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error fetching tickets' 
        });
    }
});

// 6. GET AGENT'S ASSIGNED TICKETS
app.get('/api/tickets/assigned', auth, requireRole('AGENT'), async (req, res) => {
    try {
        const tickets = await Ticket.find({ assignedAgent: req.user.userId })
            .populate('customer', 'name email')
            .sort({ createdAt: -1 });
        
        res.json({
            success: false,
            count: tickets.length,
            tickets
        });
    } catch (error) {
        console.error('Get assigned tickets error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error fetching assigned tickets' 
        });
    }
});

// 7. UPDATE TICKET STATUS (AGENT ONLY)
app.patch('/api/tickets/:id/status', auth, requireRole('AGENT'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        // Validate status
        const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid status. Must be: OPEN, IN_PROGRESS, RESOLVED, or CLOSED' 
            });
        }
        
        // Find ticket assigned to this agent
        const ticket = await Ticket.findOne({
            _id: id,
            assignedAgent: req.user.userId
        });
        
        if (!ticket) {
            return res.status(404).json({ 
                success: false,
                error: 'Ticket not found or not assigned to you' 
            });
        }
        
        // Update status
        ticket.status = status;
        await ticket.save();
        
        // Populate data
        await ticket.populate('customer', 'name email');
        await ticket.populate('assignedAgent', 'name email');
        
        res.json({
            success: true,
            message: 'Ticket status updated successfully',
            ticket
        });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error updating ticket status' 
        });
    }
});

// 8. GET ALL AGENTS (FOR REASSIGNMENT DROPDOWN)
app.get('/api/agents', auth, requireRole('AGENT'), async (req, res) => {
    try {
        // Get all agents except current agent
        const agents = await User.find({
            role: 'AGENT',
            _id: { $ne: req.user.userId }
        }).select('name email');
        
        res.json({
            success: true,
            count: agents.length,
            agents
        });
    } catch (error) {
        console.error('Get agents error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error fetching agents' 
        });
    }
});

// 9. REASSIGN TICKET - CRITICAL BUSINESS RULE (AGENT ONLY)
app.patch('/api/tickets/:id/reassign', auth, requireRole('AGENT'), async (req, res) => {
    try {
        const { id } = req.params;
        const { newAgentId } = req.body;
        
        if (!newAgentId) {
            return res.status(400).json({ 
                success: false,
                error: 'New agent ID is required' 
            });
        }
        
        // Find ticket assigned to current agent
        const ticket = await Ticket.findOne({
            _id: id,
            assignedAgent: req.user.userId
        });
        
        if (!ticket) {
            return res.status(404).json({ 
                success: false,
                error: 'Ticket not found or not assigned to you' 
            });
        }
        

        // Check if already reassigned once
        if (ticket.reassignmentCount >= 1) {
            return res.status(400).json({ 
                success: false,
                error: 'Ticket can only be reassigned once. Further reassignments are not allowed.' 
            });
        }

        
        // Check if new agent exists and is an AGENT
        const newAgent = await User.findOne({
            _id: newAgentId,
            role: 'AGENT'
        });
        
        if (!newAgent) {
            return res.status(404).json({ 
                success: false,
                error: 'New agent not found or not an agent' 
            });
        }
        
        // Check if trying to reassign to self
        if (newAgentId === req.user.userId.toString()) {
            return res.status(400).json({ 
                success: false,
                error: 'Cannot reassign ticket to yourself' 
            });
        }
        
        // Add to reassignment history
        ticket.reassignmentHistory.push({
            fromAgent: req.user.userId,
            toAgent: newAgentId,
            timestamp: new Date()
        });
        
        // Update ticket
        ticket.assignedAgent = newAgentId;
        ticket.reassignmentCount += 1;
        
        await ticket.save();
        
        // Populate all data
        await ticket.populate('customer', 'name email');
        await ticket.populate('assignedAgent', 'name email');
        await ticket.populate('reassignmentHistory.fromAgent', 'name email');
        await ticket.populate('reassignmentHistory.toAgent', 'name email');
        
        res.json({
            success: true,
            message: 'Ticket reassigned successfully',
            ticket
        });
    } catch (error) {
        console.error('Reassign ticket error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error reassigning ticket' 
        });
    }
});

// 10. GET ALL TICKETS (ADMIN/AGENT VIEW)
app.get('/api/tickets', auth, async (req, res) => {
    try {
        let query = {};
        
        // Filter based on role
        if (req.user.role === 'CUSTOMER') {
            query.customer = req.user.userId;
        } else if (req.user.role === 'AGENT') {
            query.assignedAgent = req.user.userId;
        }
        
        const tickets = await Ticket.find(query)
            .populate('customer', 'name email')
            .populate('assignedAgent', 'name email')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            count: tickets.length,
            tickets
        });
    } catch (error) {
        console.error('Get all tickets error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error fetching tickets' 
        });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        status: 'OK', 
        message: 'Support Ticket System is running',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
});