module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured in Vercel Environment Variables.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const client = String(body.client || 'New Client').slice(0, 120);
    const acv = Number(body.acv) || 0;
    const message = String(body.message || '').trim().slice(0, 3000);

    if (!message) {
      return res.status(400).json({ error: 'Missing client message text.' });
    }

    const prompt = [
      'You are a B2B SaaS Portfolio Triage Analyst for Tarang Cloud.',
      `Client: "${client}" | Annual Contract Value: ₹${acv} lakh.`,
      `Incoming Monday Message: "${message}"`,
      '',
      'Evaluate this signal and return ONLY valid JSON matching this exact schema:',
      '{',
      '  "gate": "OUTAGE" | "PR" | "NONE",',
      '  "why": "One crisp sentence explaining the urgency and business risk",',
      '  "nextStep": "One concrete next action with owner (Engineer, Demo Specialist, Support Lead, or AM)",',
      '  "confidence": 0-100 integer,',
      '  "scores": {',
      '    "F": 1-5 integer (Deal size & upside),',
      '    "U": 1-5 integer (Deadline urgency),',
      '    "I": 1-5 integer (Irreversible damage if delayed),',
      '    "R": 1-5 integer (Churn / trust risk),',
      '    "S": 1-5 integer (Fixes repeat bug / systemic debt),',
      '    "G": 1-5 integer (Strategic growth / exec visibility)',
      '  }',
      '}',
      'Rules: Set gate="OUTAGE" ONLY for live operational/billing/invoice halts. Set gate="PR" ONLY for public social-media escalations. Never invent facts not in the message.'
    ].join('\n');

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Gemini API error (${response.status})`, details: errText.slice(0, 300) });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return res.status(200).json({
      source: 'vercel-gemini-2.5-flash',
      ...parsed
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to process triage signal.', message: err.message });
  }
};
