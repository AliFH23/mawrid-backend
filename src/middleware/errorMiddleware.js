// catches any request to a route that doesn't exist (e.g. a typo in the URL)
// must be registered AFTER all real routes, right before the error handler
export const notFound = (req, res, next) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// centralized error handler — catches anything thrown or passed to next(error)
// that individual controllers' try/catch blocks didn't already handle.
// must be registered LAST, after everything else in server.js
export const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // a malformed MongoDB ObjectId (e.g. someone passed "abc123" instead of a real id)
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path}: ${err.value}` });
  }

  // a Mongoose schema validation failure that slipped through without its own try/catch
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }

  // duplicate key error (e.g. a unique field collision) that slipped through
  if (err.code === 11000) {
    return res.status(400).json({ message: 'Duplicate value violates a unique constraint' });
  }

  res.status(err.statusCode || 500).json({
    message: err.message || 'Something went wrong on the server',
  });
};