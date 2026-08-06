// Vercel Serverless Function - Realtime OTP Store & Sync
let store = global._pcdpOtpStore;
if (!store) {
  store = {};
  global._pcdpOtpStore = store;
}

module.exports = (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const session = req.query.session || (req.body && req.body.session) || 'pcdp-00dz8m';

  if (req.method === 'POST') {
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try { bodyData = JSON.parse(bodyData); } catch (e) {}
    }
    const otp = bodyData && bodyData.otp;
    if (otp) {
      if (!store[session]) store[session] = [];
      store[session].unshift({ otp: String(otp).trim(), createdAt: new Date().toISOString() });
      // Keep last 10
      store[session] = store[session].slice(0, 10);
      res.status(200).json({ success: true, history: store[session] });
      return;
    }
  }

  if (req.method === 'DELETE') {
    store[session] = [];
    res.status(200).json({ success: true, history: [] });
    return;
  }

  // GET
  const history = store[session] || [];
  res.status(200).json({ history });
};
