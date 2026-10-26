const User = require('../models/User');
const Profile = require('../models/Profile');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { notify, notifyMany } = require('../utils/notify');

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, role = 'student' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email or username already exists'
      });
    }

    // Create user
    const user = new User({
      username,
      email,
      passwordHash: password,
      role
    });

    await user.save();

    // Create basic profile
    const profile = new Profile({
      userId: user._id,
      fullName: username,
      profession: role === 'doctor' ? 'Physician' : 'Medical Student'
    });

    await profile.save();

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });

    // Notify all admins about new registration
    try {
      const admins = await User.find({ role: 'admin' });
      if (admins.length > 0) {
        await notifyMany(admins, {
          title: 'New User Registered',
          message: `A new user "${username}" (${email}) has registered as ${role}`,
          type: 'user',
          entityType: 'user',
          entityId: user._id,
        });
      }
    } catch (notifyErr) {
      console.error('Failed to notify admins about new registration:', notifyErr.message);
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Server error during registration',
      error: error.message 
    });
  }
};

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Account is not active' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        subscriptionPlan: user.subscriptionPlan
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Server error during login',
      error: error.message 
    });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash -refreshToken');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const profile = await Profile.findOne({ userId: user._id });

    res.json({
      success: true,
      user,
      profile
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ 
      message: 'Server error fetching profile',
      error: error.message 
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const { fullName, bio, country, languages, profession, specialization, university, yearsExperience, skills, interests, socialLinks } = req.body;

    // Update profile
    const profile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      {
        fullName,
        bio,
        country,
        languages,
        profession,
        specialization,
        university,
        yearsExperience,
        skills,
        interests,
        socialLinks
      },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      message: 'Server error updating profile',
      error: error.message 
    });
  }
};

// @desc    Get all users (Admin only)
// @route   GET /api/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
  try {
    // Admin can see all users; educator can see all users (needed for adding students to programs)
    if (req.user.role !== 'admin' && req.user.role !== 'educator') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const users = await User.find().select('-passwordHash -refreshToken');
    
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      message: 'Server error fetching users',
      error: error.message 
    });
  }
};

// @desc    Get user by ID (Admin only)
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    const user = await User.findById(req.params.id).select('-passwordHash -refreshToken');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const profile = await Profile.findOne({ userId: user._id });

    res.json({
      success: true,
      user,
      profile
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ 
      message: 'Server error fetching user',
      error: error.message 
    });
  }
};

// @desc    Update user (Admin only)
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-passwordHash -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      message: 'Server error updating user',
      error: error.message 
    });
  }
};

// @desc    Delete user (Admin only)
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized as admin' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Notify the user being deleted (before deletion)
    try {
      await notify({
        userId: user._id,
        title: 'Account Suspended',
        message: 'Your account has been suspended by an admin.',
        type: 'user',
        actorId: req.user.id,
      });
    } catch (notifyErr) {
      console.error('Failed to notify user about suspension:', notifyErr.message);
    }

    // Soft delete approach - update status instead of actual deletion
    user.status = 'suspended';
    await user.save();

    res.json({
      success: true,
      message: 'User has been suspended'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      message: 'Server error deleting user',
      error: error.message 
    });
  }
};

// @desc    Google OAuth login/register
// @route   POST /api/users/google-login
// @access  Public
const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: 'Google credential token is required' });
    }

    // Verify the Google ID token using Google's token info endpoint
    let payload;
    try {
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
      );
      if (!verifyRes.ok) {
        return res.status(401).json({ message: 'Invalid Google credential' });
      }
      payload = await verifyRes.json();
    } catch (err) {
      return res.status(401).json({ message: 'Google token verification failed' });
    }

    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ message: 'Google account must have an email address' });
    }

    // Check if user exists by googleId or email
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      // Existing user - link googleId if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = 'google';
        user.avatar = user.avatar || picture || '';
        user.verified = true;
        await user.save();
      }
    } else {
      // Create new user from Google profile
      const username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
      user = new User({
        username,
        email,
        googleId,
        authProvider: 'google',
        avatar: picture || '',
        verified: true,
        role: 'student'
      });
      await user.save();

      // Create basic profile
      const Profile = require('../models/Profile');
      const profile = new Profile({
        userId: user._id,
        fullName: name || username,
        profession: 'Medical Student'
      });
      await profile.save();
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        subscriptionPlan: user.subscriptionPlan,
        avatar: user.avatar,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ 
      message: 'Server error during Google authentication',
      error: error.message 
    });
  }
};

// @desc    Enroll user in a program
// @route   POST /api/users/enroll-program/:programId
// @access  Private
const enrollInProgram = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const programId = req.params.programId;
    const Program = require('../models/Program');
    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({ message: 'Program not found' });
    }

    // Check if program is inactive
    if (!program.active) {
      return res.status(403).json({ message: 'Cannot enroll in an inactive program.' });
    }

    // Check if already enrolled
    if (user.enrolledPrograms.some(id => id.toString() === programId.toString())) {
      return res.status(400).json({ message: 'Already enrolled in this program' });
    }

    // Check program capacity
    if (program.maxUsers && program.currentUsers >= program.maxUsers) {
      return res.status(400).json({ message: 'Program is full' });
    }

    // Check if user is the program owner or creator — prevent self-enrollment
    if (program.owner && program.owner.toString() === req.user.id.toString()) {
      return res.status(403).json({ message: 'You cannot enroll in your own program' });
    }
    if (program.createdBy && program.createdBy.toString() === req.user.id.toString()) {
      return res.status(403).json({ message: 'You cannot enroll in your own program' });
    }

    // Enroll user
    user.enrolledPrograms.push(programId);
    await user.save();

    // Update program user count
    program.currentUsers = (program.currentUsers || 0) + 1;
    await program.save();

    // Create enrollment record for tracking
    try {
      const ProgramEnrollment = require('../models/ProgramEnrollment');
      await ProgramEnrollment.findOneAndUpdate(
        { userId: user._id, programId },
        { userId: user._id, programId, joinedAt: new Date() },
        { upsert: true, new: true }
      );
    } catch (enrollErr) {
      console.error('Failed to create enrollment record:', enrollErr);
      // Non-blocking
    }

    res.json({
      success: true,
      message: 'Successfully enrolled in program',
      programId
    });
  } catch (error) {
    console.error('Enroll program error:', error);
    res.status(500).json({  
      message: 'Server error enrolling in program',
      error: error.message 
    });
  }
};

// @desc    Get user's enrolled programs
// @route   GET /api/users/my-programs
// @access  Private
const getMyPrograms = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('enrolledPrograms');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      programs: user.enrolledPrograms || []
    });
  } catch (error) {
    console.error('Get my programs error:', error);
    res.status(500).json({  
      message: 'Server error fetching programs',
      error: error.message 
    });
  }
};

// @desc    Get completed quiz IDs for the current user
// @route   GET /api/users/my-completed-quizzes
// @access  Private
const getMyCompletedQuizzes = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('completedQuizzes');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      completedQuizIds: user.completedQuizzes || []
    });
  } catch (error) {
    console.error('Get completed quizzes error:', error);
    res.status(500).json({
      message: 'Server error fetching completed quizzes',
      error: error.message
    });
  }
};

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  });
};

// @desc    Get all educators (no admin restriction)
// @route   GET /api/users/educators
// @access  Private (Any authenticated user)
const getEducators = async (req, res) => {
  try {
    const educators = await User.find({ role: 'educator' }).select('-passwordHash -refreshToken');
    res.json({
      success: true,
      count: educators.length,
      educators
    });
  } catch (error) {
    console.error('Get educators error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  googleAuth,
  enrollInProgram,
  getMyPrograms,
  getMyCompletedQuizzes,
  getEducators
};