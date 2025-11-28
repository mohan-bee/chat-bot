/**
 * server.js
 * Install dependencies: npm install express axios dotenv cors
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

// 1. Define the variables you need to capture (The "Goal" State)
// The 'required' logic can be dynamic in the prompt, but this is the master list.
const FIELD_DEFINITIONS = [
  { name: "form_filler_type", type: "string", description: "Who is filling the form? Options: 'Parent', 'Student'" },
  { name: "student_name", type: "string", description: "Full name of the student." },
  { name: "parent_name", type: "string", description: "Full name of the parent (Only if form_filler_type is Parent)." },
  { name: "current_grade", type: "string", description: "Current academic grade (e.g., Grade 9, Grade 12, Gap Year)." },
  { name: "phone_number", type: "string", description: "Contact number." },
  { name: "parent_email", type: "string", description: "Email address." },
  { name: "location", type: "string", description: "City or place of residence." },
  { name: "curriculum_type", type: "string", description: "Current curriculum (e.g., CBSE, ICSE, IB, State Board)." },
  { name: "school_name", type: "string", description: "Name of the current school." },
  { name: "target_geographies", type: "string", description: "Preferred countries for study (e.g., USA, UK, Canada)." },
  { name: "scholarship_requirement", type: "string", description: "Scholarship needs. Options: 'Full', 'Partial', 'None'." }
];

// ---------------- AI LOGIC ----------------

const generateSystemPrompt = (existingData) => {
  return `
    You are "Vishy", a warm, expert Senior Admissions Counselor at Beacon House.
    
    GOAL: Conduct a natural conversation to collect specific information from the user to assess their eligibility for university counseling.
    
    CURRENT CAPTURED DATA:
    ${JSON.stringify(existingData, null, 2)}
    
    REQUIRED FIELDS DEFINITIONS:
    ${JSON.stringify(FIELD_DEFINITIONS, null, 2)}
    
    INSTRUCTIONS:
    1. **Analyze** the "CURRENT CAPTURED DATA". Identify which fields are null or empty.
    2. **Context Matters**: 
       - If 'form_filler_type' is 'Student', do NOT ask for 'parent_name'. Mark 'parent_name' as 'N/A' internally or just skip it.
       - If the user provides an answer like "12", look at what you just asked. If you asked for Grade, interpret it as "Grade 12".
    3. **Next Step**: Ask for the *next* missing logical piece of information. Do not ask for everything at once. Ask one question at a time.
    4. **Tone**: Empathetic, professional, encouraging.
    5. **Correction**: If the user says "actually I am in Grade 11", update the 'current_grade' field in your output.
    
    CRITICAL OUTPUT RULE:
    You must return a JSON object ONLY. No markdown.
    Format:
    {
      "ai_message": "Your conversational response to the user here.",
      "updated_data": { "field_name": "extracted_value" }, 
      "is_complete": boolean
    }
    
    "updated_data" should ONLY contain fields that were newly extracted or corrected in this specific turn.
    "is_complete" is true ONLY when all necessary fields for the specific user type are filled.
  `;
};

app.post("/chat", async (req, res) => {
  try {
    // 1. Get Payload from Typebot
    // 'history' is optional but helps with context if Typebot sends it. 
    // 'existing_data' is the current variables Typebot has collected.
    const { user_message, existing_data } = req.body;

    // 2. Sanitize Existing Data (ensure specific keys exist)
    const currentVariables = existing_data || {};
    
    // 3. Construct Prompt
    const systemPrompt = generateSystemPrompt(currentVariables);
    
    // 4. Call Gemini
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
            { role: "user", parts: [{ text: systemPrompt + `\n\nUSER SAYS: "${user_message}"` }] }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      }
    );

    const rawText = response.data.candidates[0].content.parts[0].text;
    
    // 5. Parse JSON
    let aiResponse;
    try {
      aiResponse = JSON.parse(rawText);
    } catch (e) {
      // Fallback if AI hallucinates markdown
      const match = rawText.match(/\{[\s\S]*\}/);
      aiResponse = match ? JSON.parse(match[0]) : { ai_message: "Could you please repeat that?", updated_data: {}, is_complete: false };
    }

    // 6. Return to Typebot
    // Typebot maps the response body to variables.
    res.json(aiResponse);

  } catch (error) {
    console.error("Server Error:", error.response?.data || error.message);
    res.status(500).json({ ai_message: "I'm having trouble connecting. Please try again." });
  }
});

app.listen(8080, () => console.log("AI Backend running on port 8080"));