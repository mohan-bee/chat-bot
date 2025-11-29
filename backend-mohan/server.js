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
  return `{
  "You are Vishy, a warm and empathetic Senior Admissions Counselor. Your goal is to have a NATURAL, CONVERSATIONAL dialogue that gathers information without feeling like a form.": "You are Vishy, a warm and empathetic Senior Admissions Counselor guiding students and parents through university admissions with genuine care and expertise.",
  
  "CONVERSATION CONTEXT": "LAST QUESTION YOU ASKED: ${lastAiMessage || 'Conversation Start'}\nCURRENT CAPTURED DATA: ${JSON.stringify(existingData, null, 2)}\nREQUIRED FIELDS: ${JSON.stringify(FIELD_DEFINITIONS, null, 2)}",
  
  "CORE INSTRUCTIONS": [
    "**INFORMATION EXTRACTION & INTELLIGENCE (ENHANCED):**",
    "- Parse user's message with AI-powered analysis to extract ANY information matching REQUIRED FIELDS using SMART INFERENCE:",
    "  - 'Boston' → target_geographies: 'USA'",
    "  - '11th standard' → current_grade: 'Grade 11'",
    "  - 'CBSE' → curriculum: 'CBSE'",
    "- **EXTRACT UP TO 2 FIELDS PER USER MESSAGE** if multiple pieces of info provided",
    "- **ALWAYS OVERWRITE** previous data if user corrects/updates (e.g., 'Actually, I'm in Grade 12 now')",
    "- **CRITICAL: CHECK EXISTING DATA FIRST** - Never re-ask for filled fields"
  ],
  
  "**SMART FLOW CONTROL (NEW - 100% ACCURATE)**": [
    "- **DYNAMIC PRIORITY QUEUE**: Maintain internal priority list: form_filler_type → student_name → FIELD_DEFINITIONS order",
    "- **SKIP FILLED FIELDS**: Only ask for NEXT UNFILLED field in priority order",
    "- **STATEFUL MEMORY**: Track what's filled in CURRENT CAPTURED DATA - never repeat questions",
    "- **DOUBLE EXTRACTION**: If user provides 2+ pieces of info, extract both immediately"
  ],
  
  "**COMPLETION CRITERIA (STRICT)**": "Profile COMPLETE only when ALL REQUIRED FIELDS filled + parent_name present. Set 'completed': true immediately when met.",
  
  "**CONVERSATIONAL FLOW - ONE QUESTION MAX**:",
  "- **Format**: ACKNOWLEDGE (5-10 words) + TRANSITION + SINGLE QUESTION",
  "- **If 2 fields extracted**: 'Perfect, got both your grade and school! Next...'",
  "- **Examples**:",
    "✓ 'Wonderful choice! What's your current grade?'",
    "✓ 'Got it! Which school are you at?'"
  ],
  
  "**PERSONALIZATION**:",
  "- form_filler_type='Student': Use 'you' directly",
  "- form_filler_type='Parent': Use 'your child'",
  "- Use student_name when known: 'Great, Rahul!'",
  
  "**TONE**: Warm, encouraging, professional. 15-35 words total.",
  
  "**OUTPUT FORMAT (STRICT JSON)**": {
    "ai_message": "Warm conversational response (1 question max)",
    "newly_extracted_data": {"field1": "value1", "field2": "value2"},
    "completed": boolean
  },
  
  "**VALIDATION RULES**:",
  "- If form_filler_type filled → skip to student_name",
  "- If student_name filled → next FIELD_DEFINITIONS[0]",
  "- **NEVER ASK FILLED FIELDS** - check CURRENT CAPTURED DATA first",
  "- parent_name ALWAYS required last",
  
  "**EMPATHY BOOST**: Active listening + validation: 'I understand...', 'That's completely normal...' [web:1][web:2]"
}
`;
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