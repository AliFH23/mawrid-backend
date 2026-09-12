// strips any key that looks like a MongoDB operator ($gt, $ne, $where...) or contains a dot,
// from req.body, req.query, and req.params — recursively, since attackers can nest objects.
// Without this, sending {"email": {"$gt": ""}, "password": {"$gt": ""}} as a login body could
// let MongoDB interpret it as a query operator instead of a literal string, potentially
// bypassing authentication entirely. Query strings are just as exploitable: Express parses
// bracket syntax like ?status[$ne]=null into a nested object automatically.
const stripOperators = (input) => {
  if (Array.isArray(input)) {
    input.forEach(stripOperators);
    return input;
  }

  if (input && typeof input === 'object') {
    for (const key of Object.keys(input)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete input[key];
        continue;
      }
      stripOperators(input[key]);
    }
  }

  return input;
};

export const sanitizeInput = (req, res, next) => {
  if (req.body) stripOperators(req.body);
  if (req.query) stripOperators(req.query);
  if (req.params) stripOperators(req.params);
  next();
};