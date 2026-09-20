import DeliveryZone from '../../models/DeliveryZone.js';
import Governorate from '../../models/Governorate.js';

// @route   GET /api/delivery-zones
// @access  Private (any logged-in user)
export const getDeliveryZones = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.governorateId) filter.governorateId = req.query.governorateId;

    const zones = await DeliveryZone.find(filter).populate('governorateId').sort({ name: 1 });
    res.status(200).json({ zones });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/delivery-zones
// @access  Private (admin only)
//
// HARDENING NOTE: deletes are soft (isActive: false), so the {governorateId, name}
// unique index still blocks a fresh insert with the same name. If a matching zone
// already exists but is inactive, this reactivates it instead of failing.
export const createDeliveryZone = async (req, res) => {
  try {
    const { name, governorateId } = req.body;
    if (!name || !governorateId) {
      return res.status(400).json({ message: 'name and governorateId are required' });
    }

    const governorate = await Governorate.findOne({ _id: governorateId, isActive: true });
    if (!governorate) {
      return res.status(400).json({ message: 'Invalid governorate id' });
    }

    const existing = await DeliveryZone.findOne({ governorateId, name });
    if (existing) {
      if (existing.isActive) {
        return res.status(400).json({ message: 'This zone already exists under this governorate' });
      }
      existing.isActive = true;
      await existing.save();
      await existing.populate('governorateId');
      return res.status(200).json({ zone: existing });
    }

    const zone = await DeliveryZone.create({ name, governorateId });
    await zone.populate('governorateId');
    res.status(201).json({ zone });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This zone already exists under this governorate' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/delivery-zones/:id
// @access  Private (admin only)
export const updateDeliveryZone = async (req, res) => {
  try {
    const zone = await DeliveryZone.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('governorateId');

    if (!zone) {
      return res.status(404).json({ message: 'Delivery zone not found' });
    }

    res.status(200).json({ zone });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   DELETE /api/delivery-zones/:id
// @access  Private (admin only)
export const deleteDeliveryZone = async (req, res) => {
  try {
    const zone = await DeliveryZone.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!zone) {
      return res.status(404).json({ message: 'Delivery zone not found' });
    }

    res.status(200).json({ message: 'Delivery zone deactivated', zone });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};