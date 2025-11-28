const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// -------------- STRONG SYSTEM PROMPT -----------------
const SYSTEM_PROMPT = `
You are “Vishy’s Premium Admissions Counselor AI”.

Your personality:
- Warm, supportive, expert counselor
- Conversational, human-like, not robotic
- Friendly, reassuring, and empathetic
- Never interrogates the user; always guides naturally

Your mission:
- Guide the conversation as a friendly senior admissions counselor.
- Extract key student details based on fields provided by the developer.
- Use existing_data to avoid repeating questions.
- Ask ONLY for the **first missing field**.
- Never ask for already filled fields.
- Responses must be short, warm, and elegant.

STRICT RULES:
1. Always analyze "fields" and "existing_data".
2. Identify missing fields IN ORDER.
3. Ask ONLY about the first missing one.
4. If user provides new info, extract and update data.
5. Do not modify previous extracted fields unless user corrects them.
6. When all fields are filled, set "is_complete": true and stop asking questions.
7. Your ENTIRE RESPONSE **MUST BE VALID JSON ONLY**:
{
  "ai_message": "string",
  "extracted_data": {},
  "is_complete": false
}
8. NO markdown. NO backticks. NO explanations. NO extra text before or after JSON.
`;

// --------------- JSON EXTRACTOR (fixes invalid JSON) -----------------
function extractJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found");
    return JSON.parse(match[0]);
  } catch (err) {
    console.log("JSON Parse Error:", err);
    return {
      ai_message: "I'm sorry, could you repeat that?",
      extracted_data: {},
      is_complete: false
    };
  }
}

// ---------------- AI ENDPOINT ----------------
app.post("/ask", async (req, res) => {
  const { user_message, fields, existing_data, start } = req.body;

  // Determine missing fields
  const missingFields = fields
    .filter(f => !existing_data || !existing_data[f.name])
    .map(f => f.name);

  const firstMissing = missingFields[0] || null;

  // Build full prompt
  const full_prompt = `
${SYSTEM_PROMPT}

FIELDS TO EXTRACT:
${fields.map(f => `${f.name} (${f.datatype}): ${f.description}`).join("\n")}

CURRENT EXTRACTED DATA:
${JSON.stringify(existing_data, null, 2)}

MISSING FIELDS: ${missingFields.join(", ")}

FIRST MISSING FIELD TO ASK ABOUT: ${firstMissing}

STARTING CONVERSATION? ${start}

USER MESSAGE:
"${user_message}"

Remember: Return ONLY valid JSON. Ask ONLY about the first missing field.
`;

  try {
    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        contents: [{ role: "user", parts: [{ text: full_prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      },
      { params: { key: process.env.GEMINI_API_KEY } }
    );

    const rawResponse = response.data.candidates[0].content.parts[0].text;

    const cleanJSON = extractJSON(rawResponse);

    return res.json({ output: cleanJSON });

  } catch (err) {
    console.log("AI ERROR:", err.response?.data || err);
    return res.status(500).json({ error: "AI Request Failed" });
  }
});

// ---------------- START SERVER ----------------
app.listen(8080, () => {
  console.log("Server running on http://localhost:8080");
});
