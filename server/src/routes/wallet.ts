/**
 * Express route: POST /api/wallet
 * Wallet tracking via Dome API
 */
import { Router, Request, Response } from "express";

const router = Router();

const DOME_API_BASE = "https://api.domeapi.io/v1";

router.post("/", async (req: Request, res: Response) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ success: false, error: "Missing 'address'" });

  const domeKey = process.env.DOME_API_KEY;
  if (!domeKey) return res.status(500).json({ success: false, error: "DOME_API_KEY is not configured" });

  try {
    const response = await fetch(`${DOME_API_BASE}/polymarket/positions/${address}`, {
      headers: { Authorization: `Bearer ${domeKey}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ success: false, error: errText });
    }

    const data = await response.json();
    return res.json({ success: true, data });
  } catch (error) {
    console.error("wallet-tracking error:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
