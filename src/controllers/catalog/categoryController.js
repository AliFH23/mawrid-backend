import Category from '../../models/Category.js';

// @route   GET /api/categories
// @access  Private (any logged-in user)
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/categories
// @access  Private (admin only)
export const createCategory = async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const existing = await Category.findOne({ name });
    if (existing) {
      if (existing.isActive) {
        return res.status(400).json({ message: 'This category already exists' });
      }
      existing.isActive = true;
      if (icon !== undefined) existing.icon = icon;
      await existing.save();
      return res.status(200).json({ category: existing });
    }

    const category = await Category.create({ name, icon });
    res.status(201).json({ category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This category already exists' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/categories/:id
// @access  Private (admin only)
export const updateCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(200).json({ category });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   DELETE /api/categories/:id
// @access  Private (admin only)
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(200).json({ message: 'Category deactivated', category });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};