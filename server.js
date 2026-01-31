const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.log('❌ MongoDB Connection Error:', err));

// Import Models
const User = require('./models/User');
const Ticket = require('./models/Ticket');

// AUTHENTICATION MIDDLEWARE
const authMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

// Check Role Middleware
const checkRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Access denied. ${role} role required.` });
    }
    next();
  };
};

// ==================== API ROUTES ====================

// 1. REGISTER USER
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Validate role
    if (!['CUSTOMER', 'AGENT'].includes(role)) {
      return res.status(400).json({ error: 'Role must be CUSTOMER or AGENT' });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role
    });
    
    await user.save();
    
    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
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
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// 2. LOGIN USER
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check password
    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
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
    res.status(500).json({ error: 'Server error during login' });
  }
});

// 3. GET CURRENT USER
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. CREATE TICKET (CUSTOMER ONLY)
app.post('/api/tickets', authMiddleware, checkRole('CUSTOMER'), async (req, res) => {
  try {
    const { issueDetails } = req.body;
    
    if (!issueDetails || issueDetails.trim().length === 0) {
      return res.status(400).json({ error: 'Issue details are required' });
    }
    
    // Find available agents
    const agents = await User.find({ role: 'AGENT' });
    if (agents.length === 0) {
      return res.status(400).json({ error: 'No agents available' });
    }
    
    // Assign to random agent
    const randomAgent = agents[Math.floor(Math.random() * agents.length)];
    
    // Create ticket
    const ticket = new Ticket({
      customer: req.user.userId,
      assignedAgent: randomAgent._id,
      issueDetails: issueDetails.trim()
    });
    
    await ticket.save();
    
    // Populate data
    await ticket.populate('customer', 'name email');
    await ticket.populate('assignedAgent', 'name email');
    
    res.status(201).json({
      message: 'Ticket created successfully',
      ticket
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Server error creating ticket' });
  }
});

// 5. GET CUSTOMER'S TICKETS
app.get('/api/tickets/my-tickets', authMiddleware, checkRole('CUSTOMER'), async (req, res) => {
  try {
    const tickets = await Ticket.find({ customer: req.user.userId })
      .populate('assignedAgent', 'name email')
      .sort({ createdAt: -1 });
    
    res.json({ tickets });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ error: 'Server error fetching tickets' });
  }
});

// 6. GET AGENT'S ASSIGNED TICKETS
app.get('/api/tickets/assigned', authMiddleware, checkRole('AGENT'), async (req, res) => {
  try {
    const tickets = await Ticket.find({ assignedAgent: req.user.userId })
      .populate('customer', 'name email')
      .sort({ createdAt: -1 });
    
    res.json({ tickets });
  } catch (error) {
    console.error('Get assigned tickets error:', error);
    res.status(500).json({ error: 'Server error fetching assigned tickets' });
  }
});

// 7. UPDATE TICKET STATUS (AGENT ONLY)
app.patch('/api/tickets/:id/status', authMiddleware, checkRole('AGENT'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Find ticket assigned to this agent
    const ticket = await Ticket.findOne({
      _id: id,
      assignedAgent: req.user.userId
    });
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found or not assigned to you' });
    }
    
    // Update status
    ticket.status = status;
    await ticket.save();
    
    // Populate data
    await ticket.populate('customer', 'name email');
    await ticket.populate('assignedAgent', 'name email');
    
    res.json({
      message: 'Ticket status updated successfully',
      ticket
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Server error updating ticket status' });
  }
});

// 8. GET ALL AGENTS (FOR REASSIGNMENT DROPDOWN)
app.get('/api/agents', authMiddleware, checkRole('AGENT'), async (req, res) => {
  try {
    // Get all agents except current agent
    const agents = await User.find({
      role: 'AGENT',
      _id: { $ne: req.user.userId }
    }).select('name email');
    
    res.json({ agents });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ error: 'Server error fetching agents' });
  }
});

// 9. REASSIGN TICKET - CRITICAL BUSINESS RULE (AGENT ONLY)
app.patch('/api/tickets/:id/reassign', authMiddleware, checkRole('AGENT'), async (req, res) => {
  try {
    const { id } = req.params;
    const { newAgentId } = req.body;
    
    if (!newAgentId) {
      return res.status(400).json({ error: 'New agent ID is required' });
    }
    
    // Find ticket assigned to current agent
    const ticket = await Ticket.findOne({
      _id: id,
      assignedAgent: req.user.userId
    });
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found or not assigned to you' });
    }
    
    // ========== CRITICAL BUSINESS RULE ==========
    // Check if already reassigned once
    if (ticket.reassignmentCount >= 1) {
      return res.status(400).json({ 
        error: 'Ticket can only be reassigned once. Further reassignments are not allowed.' 
      });
    }
    // ===========================================
    
    // Check if new agent exists and is an AGENT
    const newAgent = await User.findOne({
      _id: newAgentId,
      role: 'AGENT'
    });
    
    if (!newAgent) {
      return res.status(404).json({ error: 'New agent not found' });
    }
    
    // Check if trying to reassign to self
    if (newAgentId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot reassign ticket to yourself' });
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
      message: 'Ticket reassigned successfully',
      ticket
    });
  } catch (error) {
    console.error('Reassign ticket error:', error);
    res.status(500).json({ error: 'Server error reassigning ticket' });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Support Ticket System is running',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
});