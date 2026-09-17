import Governorate from '../models/Governorate.js';

// @route   GET /api/governorates
// @access  Private (any logged-in user)
export const getGovernorates = async (req, res) => {
  try {
    const governorates = await Governorate.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({ governorates });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/governorates
// @access  Private (admin only)
export const createGovernorate = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Governorate name is required' });
    }

    const existing = await Governorate.findOne({ name });
    if (existing) {
      if (existing.isActive) {
        return res.status(400).json({ message: 'This governorate already exists' });
      }
      existing.isActive = true;
      await existing.save();
      return res.status(200).json({ governorate: existing });
    }

    const governorate = await Governorate.create({ name });
    res.status(201).json({ governorate });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This governorate already exists' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/governorates/:id
// @access  Private (admin only)
export const updateGovernorate = async (req, res) => {
  try {
    const governorate = await Governorate.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!governorate) {
      return res.status(404).json({ message: 'Governorate not found' });
    }

    res.status(200).json({ governorate });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   DELETE /api/governorates/:id
// @access  Private (admin only)
export const deleteGovernorate = async (req, res) => {
  try {
    const governorate = await Governorate.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!governorate) {
      return res.status(404).json({ message: 'Governorate not found' });
    }

    res.status(200).json({ message: 'Governorate deactivated', governorate });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};