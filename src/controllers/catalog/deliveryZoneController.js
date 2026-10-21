import DeliveryZone from '../../models/DeliveryZone.js';
import Governorate from '../../models/Governorate.js';

// a pin further than this from every zone center is treated as "outside our coverage"
const MAX_RESOLVE_DISTANCE_KM = 30;

// rough bounding box of Jordan — rejects typos and pins dropped in the wrong country
const JORDAN_BOUNDS = { minLat: 29.0, maxLat: 33.5, minLng: 34.8, maxLng: 39.5 };

const isInsideJordan = (lat, lng) =>
  lat >= JORDAN_BOUNDS.minLat && lat <= JORDAN_BOUNDS.maxLat && lng >= JORDAN_BOUNDS.minLng && lng <= JORDAN_BOUNDS.maxLng;

// great-circle distance in km between two lat/lng points
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// returns { center } for a valid {lat,lng}, { error } for a bad one
const parseCenter = (center) => {
  const lat = Number(center?.lat);
  const lng = Number(center?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInsideJordan(lat, lng)) {
    return { error: 'center must be a valid lat/lng inside Jordan' };
  }
  return { center: { lat, lng } };
};

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

// @route   GET /api/delivery-zones/resolve?lat=..&lng=..
// @access  same as GET /api/delivery-zones (the register page needs it before login)
// finds the nearest active zone (that has a map center) to a pin, so the frontend can
// fill in the governorate and zone automatically. The governorate comes from the zone.
export const resolveDeliveryZone = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'lat and lng are required numbers' });
    }
    if (!isInsideJordan(lat, lng)) {
      return res.status(404).json({ message: 'This location is outside Jordan' });
    }

    const zones = await DeliveryZone.find({
      isActive: true,
      'center.lat': { $type: 'number' },
      'center.lng': { $type: 'number' },
    }).populate({ path: 'governorateId', match: { isActive: true } });

    let best = null;
    for (const zone of zones) {
      if (!zone.governorateId) continue; // its governorate was deactivated
      const distanceKm = haversineKm(lat, lng, zone.center.lat, zone.center.lng);
      if (!best || distanceKm < best.distanceKm) best = { zone, distanceKm };
    }

    if (!best) {
      return res.status(404).json({ message: 'No zones have a map location yet' });
    }
    if (best.distanceKm > MAX_RESOLVE_DISTANCE_KM) {
      return res.status(404).json({ message: 'This location is outside the areas we cover' });
    }

    res.status(200).json({ zone: best.zone, distanceKm: Math.round(best.distanceKm * 10) / 10 });
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
    const { name, governorateId, center } = req.body;
    if (!name || !governorateId) {
      return res.status(400).json({ message: 'name and governorateId are required' });
    }

    let parsedCenter;
    if (center) {
      const parsed = parseCenter(center);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      parsedCenter = parsed.center;
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
      if (parsedCenter) existing.center = parsedCenter;
      await existing.save();
      await existing.populate('governorateId');
      return res.status(200).json({ zone: existing });
    }

    const zone = await DeliveryZone.create({ name, governorateId, ...(parsedCenter && { center: parsedCenter }) });
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
// body may contain: name, isActive, governorateId, center ({lat,lng}, or null to clear it)
export const updateDeliveryZone = async (req, res) => {
  try {
    const { name, isActive, governorateId, center } = req.body;
    const update = {};
    const unset = {};

    if (name !== undefined) update.name = name;
    if (isActive !== undefined) update.isActive = isActive;
    if (governorateId !== undefined) update.governorateId = governorateId;

    if (center === null) {
      unset.center = 1;
    } else if (center !== undefined) {
      const parsed = parseCenter(center);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      update.center = parsed.center;
    }

    const mongoUpdate = {};
    if (Object.keys(update).length) mongoUpdate.$set = update;
    if (Object.keys(unset).length) mongoUpdate.$unset = unset;
    if (!Object.keys(mongoUpdate).length) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    const zone = await DeliveryZone.findByIdAndUpdate(req.params.id, mongoUpdate, {
      new: true,
      runValidators: true,
    }).populate('governorateId');

    if (!zone) {
      return res.status(404).json({ message: 'Delivery zone not found' });
    }

    res.status(200).json({ zone });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This zone already exists under this governorate' });
    }
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