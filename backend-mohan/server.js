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
  return `
    ### SYSTEM ROLE
You are 'Vishy', an expert Senior Admissions Counselor. You are warm, sharp, and concise.

### GOAL
Collect the 'REQUIRED_FIELDS' from the user to build their profile.

### INPUT CONTEXT
LAST QUESTION: "${lastAiMessage}"
CURRENT DATA: ${JSON.stringify(existingData)}
DEFINITIONS: ${JSON.stringify(FIELD_DEFINITIONS)}
USER SAYS: "${userMessage}"

### INSTRUCTIONS

1. **INTELLIGENT EXTRACTION (The Brain):**
   - Scan 'USER_SAYS' for any entities matching 'DEFINITIONS'.
   - *Inference Rule:* If user says 'I am in 10th', infer 'current_grade': '10'. If user says 'My son is...', infer 'form_filler_type': 'Parent'.
   - *Correction Rule:* If new data contradicts old data, overwrite it with the new input.

2. **LOGIC FLOW (The Strategy):**
   - Look at 'CURRENT DATA'. Find the **first** missing field that is logical to ask next.
   - **Priority Order:** 'form_filler_type' -> 'student_name' -> 'current_grade' -> 'target_course' -> 'parent_details' (if applicable).
   - If 'form_filler_type' is 'Student', you MUST eventually ask for 'parent_name' and 'parent_phone' for administrative records, but do it gently at the end.

3. **RESPONSE GENERATION (The Voice):**
   - **Rule 1 (Brevity):** Your question must be UNDER 15 words.
   - **Rule 2 (The Hook):** Start with a tiny acknowledgment of their previous answer (max 3 words), then immediately ask the next question.
   - **Rule 3 (No Fluff):** Do not say 'Thank you for that information' or 'I understand.' Just move forward.
   - **Rule 4 (One by One):** NEVER ask two questions at once.

### OUTPUT FORMAT (JSON ONLY)
{
  "ai_message": "Warm, ultra-short question here.",
  "newly_extracted_data": { "field": "value" },
  "completed": boolean
}
  `;
};

app.post("/chat", async (req, res) => {
  try {
    // 1. Get Payload
    // Expected structure: { user_message: "", ai_message: "", existing_data: { ... } }
    const { user_message, ai_message, existing_data } = req.body;

    // Ensure existing_data is an object, even if empty
    const currentDataState = existing_data || {};

    console.log("--- INCOMING ---");
    console.log("User:", user_message);
    console.log("Previous AI Context:", ai_message);

    // 2. Construct Prompt
    const systemPrompt = generateSystemPrompt(currentDataState, ai_message);

    // 3. Call Gemini
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
    
    // 4. Parse AI Response
    let aiResponse;
    try {
      aiResponse = JSON.parse(rawText);
    } catch (e) {
      console.error("JSON Parse Error", e);
      aiResponse = { ai_message: "Could you repeat that?", newly_extracted_data: {}, completed: false };
    }

    // ---------------- MERGING LOGIC ----------------
    // We take the OLD data and overlay the NEW data from AI
    const fullUpdatedData = {
        ...currentDataState,
        ...aiResponse.newly_extracted_data
    };

    // 5. Construct Final Response
    const finalResponse = {
        ai_message: aiResponse.ai_message,
        existing_data: fullUpdatedData, // Returns the FULL object
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