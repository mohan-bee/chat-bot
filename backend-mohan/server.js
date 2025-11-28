/**
 * server.js
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

const generateSystemPrompt = (existingData) => {
  return `
    You are "Vishy", a warm, expert Senior Admissions Counselor.
    
    GOAL: Conduct a natural conversation to collect information.
    
    CURRENT CAPTURED DATA (Context):
    ${JSON.stringify(existingData, null, 2)}
    
    REQUIRED FIELDS:
    ${JSON.stringify(FIELD_DEFINITIONS, null, 2)}
    
    INSTRUCTIONS:
    1. **Analyze** the user's input against the "CURRENT CAPTURED DATA".
    2. **Extract** any new information provided in the "USER SAYS" section and map it to the fields. 
    3. **Update Logic**: 
       - If the user says "I'm a student", set 'form_filler_type' to 'Student'.
       - If 'form_filler_type' is 'Student', mark 'parent_name' as 'N/A' automatically.
    4. **Next Step**: Ask for the *next* missing logical piece of information.
    
    CRITICAL OUTPUT RULE:
    Return JSON ONLY.
    {
      "ai_message": "string (The conversational response asking the next question)",
      "updated_data": { "field_name": "extracted_value" }, 
      "is_complete": boolean
    }
    
    NOTE: "updated_data" should only contain NEW or CHANGED fields from this specific turn.
  `;
};

app.post("/chat", async (req, res) => {
  try {
    // 1. Get Payload
    // existing_data comes from the Client (Typebot/Frontend) state
    const { user_message, existing_data } = req.body;
    const currentVariables = existing_data || {};

    console.log("--- INCOMING REQUEST ---");
    console.log("User Says:", user_message);
    console.log("Current Context:", JSON.stringify(currentVariables));

    // 2. Construct Prompt
    const systemPrompt = generateSystemPrompt(currentVariables);

    // 3. Call Gemini
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          { 
            role: "user", 
            parts: [{ text: systemPrompt + `\n\nUSER SAYS: "${user_message}"` }] 
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      }
    );

    const rawText = response.data.candidates[0].content.parts[0].text;

    // 4. Parse JSON
    let aiResponse;
    try {
      aiResponse = JSON.parse(rawText);
    } catch (e) {
      aiResponse = { 
        ai_message: "I didn't quite catch that. Could you repeat?", 
        updated_data: {}, 
        is_complete: false 
      };
    }

    // 5. Console Log for Debugging (The "Loopback" check)
    // This shows you what the NEW state looks like by merging locally for the log
    const mergedState = { ...currentVariables, ...aiResponse.updated_data };
    console.log("--- AI RESPONSE ---");
    console.log("AI Message:", aiResponse.ai_message);
    console.log("Extracted Data:", aiResponse.updated_data);
    console.log(">> FULL CONTEXT STATE:", JSON.stringify(mergedState)); 
    console.log("---------------------\n");

    res.json(aiResponse);

  } catch (error) {
    console.error("Server Error:", error.response?.data || error.message);
    res.status(500).json({ ai_message: "Connection error." });
  }
});

app.listen(8080, () => console.log("AI Backend running on port 8080"));