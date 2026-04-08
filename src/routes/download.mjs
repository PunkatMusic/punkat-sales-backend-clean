import express from "express";

export const downloadRouter = express.Router();

downloadRouter.get("/:token", async (req, res) => {
  res.status(501).json({
    error: "Download fulfillment is scaffolded but not connected to protected files yet.",
    token: req.params.token,
  });
});
