/**
 * server.js
 * Install: npm install express axios dotenv cors
 * Run: node server.js
 */
const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ---------------- CONFIGURATION -----------------
const FIELD_DEFINITIONS = [
  { name: "form_filler_type", type: "string", description: "Who is filling the form? Options: 'Parent', 'Student'" },
  { name: "student_name", type: "string", description: "Full name of the student." },
  { name: "parent_name", type: "string", description: "Full name of the parent (Only if form_filler_type is Parent)." },
  { name: "current_grade", type: "string", description: "Current academic grade (e.g., Grade 9, Grade 12, Gap Year)." },
  { name: "phone_number", type: "string", description: "Contact number." },
  { name: "parent_email", type: "string", description: "Email address." },
  { name: "location", type: "string", description: "City or place of residence." },
  { name: "curriculum_type", type: "string", description: "Current curriculum (e.g., CBSE, ICSE, IB)." },
  { name: "school_name", type: "string", description: "Name of the current school." },
  { name: "target_geographies", type: "string", description: "Preferred countries for study (e.g., USA, UK)." },
  { name: "scholarship_requirement", type: "string", description: "Scholarship needs. Options: 'Full', 'Partial', 'None'." }
];

// ---------------- AI LOGIC ----------------

const generateSystemPrompt = (existingData, lastAiMessage) => {
  return `You are Vishy, a friendly Senior Admissions Counselor. Keep responses SHORT (1-2 sentences max).

LAST QUESTION: "${lastAiMessage || 'Start'}"
CURRENT DATA: ${JSON.stringify(existingData)}
REQUIRED FIELDS: ${JSON.stringify(FIELD_DEFINITIONS)}

RULES:
1. Extract info from user's message. Infer when obvious (e.g., "London" → UK).
2. Update fields if user corrects previous answers.
3. COMPLETE when: all fields filled + parent_name exists (even if Student is chatting).
4. Ask for ONE missing field at a time, following order in FIELD_DEFINITIONS.
5. VOICE:
   - If form_filler_type='Student': Address as "you" + use student_name if known
   - If form_filler_type='Parent': Say "your child" or use student_name
   - For parent_name when Student chatting: "Could you share your parent's full name for our records?"
6. TONE: Brief acknowledgment (3-5 words) + question. Example: "Great! Which grade are you in?"

OUTPUT (JSON only):
{
  "ai_message": "short response here",
  "newly_extracted_data": { "field": "value" },
  "completed": boolean
}`;
};

app.post("/chat", async (req, res) => {
  try {
    const { user_message, ai_message, existing_data } = req.body;
    const currentDataState = existing_data || {};

    console.log("--- INCOMING ---");
    console.log("User:", user_message);
    console.log("Previous AI Context:", ai_message);

    const systemPrompt = generateSystemPrompt(currentDataState, ai_message);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          { role: "user", parts: [{ text: systemPrompt + `\n\nUSER SAYS: "${user_message}"` }] }
        ],
        generationConfig: { responseMimeType: "application/json" }
      }
    );

    const rawText = response.data.candidates[0].content.parts[0].text;
    
    let aiResponse;
    try {
      aiResponse = JSON.parse(rawText);
    } catch (e) {
      console.error("JSON Parse Error", e);
      aiResponse = { ai_message: "Could you repeat that?", newly_extracted_data: {}, completed: false };
    }

    const fullUpdatedData = {
        ...currentDataState,
        ...aiResponse.newly_extracted_data
    };

    const finalResponse = {
        ai_message: aiResponse.ai_message,
        existing_data: fullUpdatedData,
        completed: aiResponse.completed
    };

    console.log("--- OUTGOING ---");
    console.log("AI Message:", finalResponse.ai_message);
    console.log("Full Data State:", JSON.stringify(finalResponse.existing_data));
    console.log("----------------\n");

    res.json(finalResponse);

  } catch (error) {
    console.error("Server Error:", error.response?.data || error.message);
    res.status(500).json({ ai_message: "Connection error.", existing_data: req.body.existing_data, completed: false });
  }
});

app.listen(8080, () => console.log("AI Backend running on port 8080"));