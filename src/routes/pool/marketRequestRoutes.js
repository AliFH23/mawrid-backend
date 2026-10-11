import express from 'express';
import {
  listRequests,
  createRequest,
  voteOnRequest,
  withdrawVote,
  closeRequest,
  fulfillRequest,
} from '../../controllers/pool/Marketrequestcontroller.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, authorize('buyer', 'supplier', 'admin'), listRequests);
router.post('/', protect, authorize('buyer'), createRequest);

router.put('/:id/vote', protect, authorize('buyer'), voteOnRequest);
router.delete('/:id/vote', protect, authorize('buyer'), withdrawVote);
router.put('/:id/close', protect, authorize('buyer'), closeRequest);

router.put('/:id/fulfill', protect, authorize('supplier'), fulfillRequest);

export default router;