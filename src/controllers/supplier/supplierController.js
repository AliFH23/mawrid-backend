import Supplier from '../../models/Supplier.js';

// @route   POST /api/suppliers
// @access  Private (supplier only)
export const createSupplier = async (req, res) => {
  try {
    if (req.user.role !== 'supplier') {
      return res.status(403).json({ message: 'Only supplier accounts can create a supplier profile' });
    }

    const { companyName, companyDescription, commercialRegistrationNumber } = req.body;

    if (!companyName) {
      return res.status(400).json({ message: 'companyName is required' });
    }
    if (!commercialRegistrationNumber) {
      return res.status(400).json({ message: 'commercialRegistrationNumber is required' });
    }

    const existingSupplier = await Supplier.findOne({ userId: req.user._id });
    if (existingSupplier) {
      return res.status(400).json({ message: 'This user already has a supplier profile' });
    }

    const supplier = await Supplier.create({
      userId: req.user._id,
      companyName,
      companyDescription,
      commercialRegistrationNumber,
    });

    res.status(201).json({ supplier });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/suppliers/me
// @access  Private (supplier only)
export const getMySupplierProfile = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ userId: req.user._id });

    if (!supplier) {
      return res.status(404).json({ message: 'No supplier profile found for this user' });
    }

    res.status(200).json({ supplier });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/suppliers/me
// @access  Private (supplier only)
export const updateMySupplierProfile = async (req, res) => {
  try {
    const { companyName, companyDescription, commercialRegistrationNumber } = req.body;

    const supplier = await Supplier.findOneAndUpdate(
      { userId: req.user._id },
      { companyName, companyDescription, commercialRegistrationNumber },
      { new: true, runValidators: true }
    );

    if (!supplier) {
      return res.status(404).json({ message: 'No supplier profile found for this user' });
    }

    res.status(200).json({ supplier });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/suppliers
// @access  Private (admin only)
export const getSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.find().populate('userId', 'name email phone');
    res.status(200).json({ suppliers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/suppliers/:id
// @access  Private (admin only)
export const getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id).populate('userId', 'name email phone');

    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    res.status(200).json({ supplier });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};