import ContactMessage from '../../models/ContactMessage.js';

// @route   POST /api/contact-messages
// @access  Public
export const createContactMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: 'name, email, and message are all required' });
    }

    const contactMessage = await ContactMessage.create({ name, email, message });
    res.status(201).json({ message: 'تم إرسال رسالتك بنجاح', contactMessage });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/contact-messages
// @access  Private (admin only)
export const getContactMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.status(200).json({ messages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/contact-messages/:id/mark-read
// @access  Private (admin only)
export const markMessageRead = async (req, res) => {
  try {
    const message = await ContactMessage.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    res.status(200).json({ message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};