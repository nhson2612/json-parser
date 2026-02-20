const path = require("path");
const express = require("express");
const { parseSmart } = require("./parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.text({ type: "*/*", limit: "10mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/parse", (req, res) => {
  const input = typeof req.body === "string" ? req.body : "";
  const result = parseSmart(input);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`json-parser listening on ${PORT}`);
});
