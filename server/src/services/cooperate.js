// Minimal stub to allow local backend startup without missing module errors
export const ensureCooperateRequestsSchema = async () => {
  // No-op placeholder; real implementation creates required tables
};

export const registerCooperateRoutes = (app) => {
  // Health route placeholder for cooperate service
  app.get('/api/cooperate/health', (req, res) => res.json({ ok: true }));
};