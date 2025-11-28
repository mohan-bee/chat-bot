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
    You are "Vishy", a warm, expert Senior Admissions Counselor.
    
    GOAL: Conduct a natural conversation to collect information for the "REQUIRED FIELDS".
    
    LAST QUESTION YOU ASKED: "${lastAiMessage || 'None (Conversation Start)'}"
    
    CURRENT CAPTURED DATA:
    ${JSON.stringify(existingData, null, 2)}
    
    REQUIRED FIELDS DEFINITIONS:
    ${JSON.stringify(FIELD_DEFINITIONS, null, 2)}
    
    INSTRUCTIONS:
    1. **Analyze** the "USER SAYS" input.
    2. **Extract** new information. 
       - If the user implies something (e.g., "I'm in 12th" -> current_grade: "Grade 12"), map it.
       - If 'form_filler_type' is 'Student', you can implicitly set 'parent_name' to 'N/A'.
    3. **Next Step**: Check which fields are still empty/null in "CURRENT CAPTURED DATA". Ask for the next logical missing field.
    4. **Tone**: Short, professional, and conversational. Don't be robotic.
    
    OUTPUT FORMAT (JSON ONLY):
    {
      "ai_message": "your response here",
      "newly_extracted_data": { "field_name": "value" }, 
      "completed": boolean
    }
    
    - "newly_extracted_data": Only include fields found in THIS specific turn. 
    - "completed": True only if all necessary fields are filled.
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